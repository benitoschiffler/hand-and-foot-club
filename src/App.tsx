import { useEffect, useMemo, useRef, useState } from "react";
import {
  addToMeld,
  chooseStartingHand,
  createGame,
  createMeld,
  discardCard,
  drawFromStock,
  drawSplit,
  pickUpDiscard,
  repairOpeningStatus,
  runCpuTurn,
  undoMeldsThisTurn,
} from "./game/engine";
import { VictoryCelebration } from "./VictoryCelebration";
import { GameHistory } from "./components/GameHistory";
import { InstallHelp } from "./components/InstallHelp";
import { canAddToMeld, canCreateMeld, cardLabel, cardPoints, findUniqueAddTarget, SUIT_SYMBOL } from "./game/rules";
import { clearGameSession, loadGameSession, saveGameSession, type SavedGameSession } from "./lib/localSession";
import { fetchFinishedGames, fetchRoomByCode, getSessionUser, recordFinishedGame, subscribeToRoom, updateRoomState } from "./lib/supabase";
import type { Card, Difficulty, GameState, Meld } from "./types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const APP_VERSION = "mobile-preview-3";

function PlayingCard({ card, selected }: {
  card: Card;
  selected: boolean;
}) {
  const rank = card.rank === "JOKER" ? "Jkr" : card.rank;
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <div
      className={`playing-card ${card.suit.toLowerCase()} ${selected ? "selected" : ""}`}
    >
      <div>
        <div className="card-value">{rank}</div>
        <div className="card-suit">{suit}</div>
      </div>
      <div className="card-center">{suit}</div>
      <div style={{ transform: "rotate(180deg)", alignSelf: "flex-end" }}>
        <div className="card-value">{rank}</div>
        <div className="card-suit">{suit}</div>
      </div>
    </div>
  );
}

function SortablePlayingCard({ card, selected, onToggle }: {
  card: Card;
  selected: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });

  const zIndex = isDragging ? 50 : 1;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : (transition ? `${transition}, z-index 0ms 250ms` : 'z-index 0ms 250ms'),
    touchAction: 'pan-y',
    zIndex,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      className={isDragging ? 'is-dragging' : ''}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${cardLabel(card)}${selected ? ", selected" : ""}`}
    >
      <PlayingCard card={card} selected={selected} />
    </div>
  );
}

function DroppableDiscard({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'discard-pile' });
  return (
    <div ref={setNodeRef} style={{ outline: isOver ? '4px solid #ef4444' : 'none', borderRadius: '12px' }}>
      {children}
    </div>
  );
}

function MeldStack({ meld, selectable, selected, onSelect }: { meld: Meld; selectable?: boolean; selected?: boolean; onSelect?: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: `meld-${meld.id}` });
  const sortedCards = [...meld.cards].sort((a, b) => {
    const isAWild = a.rank === "2" || a.rank === "JOKER";
    const isBWild = b.rank === "2" || b.rank === "JOKER";
    if (isAWild && !isBWild) return -1;
    if (!isAWild && isBWild) return 1;
    return 0;
  });

  const body = (
    <>
      <div className="meld-header">
        <span>Meld</span>
        <span>{meld.cards.length} cards</span>
      </div>
      <div className="card-fan" style={{ width: `${Math.max(120, (sortedCards.length - 1) * 26 + 40)}px` }}>
        {sortedCards.map((card, index) => (
          <div
            key={card.id}
            className={`mini-card ${card.suit.toLowerCase()}`}
            style={{ left: `${index * 26}px`, zIndex: index + 1 }}
            title={cardLabel(card)}
          >
            <div>{card.rank === "JOKER" ? "Jkr" : card.rank}</div>
            <div>{SUIT_SYMBOL[card.suit]}</div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`meld-stack ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      onClick={selectable ? onSelect : undefined}
      aria-disabled={!selectable}
      aria-pressed={selected}
      style={{ outline: isOver ? '4px solid #3b82f6' : 'none' }}
    >
      {body}
    </button>
  );
}

function App() {
  const remoteUpdateRef = useRef(false);
  const serverUpdatedAtRef = useRef<string | null>(null);
  const finishedRecordedRef = useRef<string | null>(null);
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMeld, setSelectedMeld] = useState<string>("");
  const [deckCount, setDeckCount] = useState(3);
  const [message, setMessage] = useState("Welcome! Tap a button below to get started.");
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; scores: Array<{ id: string; name: string; score: number }> }>>([]);
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [savedSession, setSavedSession] = useState<SavedGameSession | null>(null);
  const [showNewGameChoices, setShowNewGameChoices] = useState(false);
  const [reportStatus, setReportStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setSavedSession(loadGameSession());
    void getSessionUser().then((user) => {
      if (user) {
        setAuthUser(user.id);
      }
    });
    void fetchFinishedGames().then(setHistory);
  }, []);

  useEffect(() => {
    if (!state?.winnerId) return;
    if (!authUser) return;
    if (finishedRecordedRef.current === state.id) return;
    if (state.mode === "online" && state.winnerId !== viewerPlayerId) return;
    finishedRecordedRef.current = state.id;
    clearGameSession();
    setSavedSession(null);
    void recordFinishedGame(state.mode === "online" ? state.id : null, authUser, state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
    }))).then(() => fetchFinishedGames().then(setHistory));
  }, [state?.winnerId, state?.id, state?.mode, state?.players, authUser, viewerPlayerId]);

  useEffect(() => {
    if (!state || state.mode !== "online") return;
    return subscribeToRoom(state.id, (remoteState, updatedAt) => {
      remoteUpdateRef.current = true;
      serverUpdatedAtRef.current = updatedAt;
      setSyncStatus("Game synced");
      setState(repairOpeningStatus(remoteState));
    });
  }, [state?.id, state?.mode]);

  useEffect(() => {
    if (!state) return;
    const current = state.players[state.currentPlayer];
    if (!current?.isCpu || state.winnerId) return;
    const timer = window.setTimeout(() => {
      setState((previous) => (previous ? runCpuTurn(previous) : previous));
    }, 1500); // Slower CPU for easier reading
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!state || state.mode !== "online") return;
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    const expectedUpdatedAt = serverUpdatedAtRef.current;
    void updateRoomState(state.id, state, expectedUpdatedAt)
      .then(async (result) => {
        if (result.conflict && state.roomCode) {
          const latest = await fetchRoomByCode(state.roomCode);
          if (latest) {
            remoteUpdateRef.current = true;
            serverUpdatedAtRef.current = latest.updatedAt;
            setState(repairOpeningStatus(latest.state));
            setSyncStatus("The other player moved first. Game refreshed.");
          }
          return;
        }
        serverUpdatedAtRef.current = result.updatedAt;
        setSyncStatus("Game saved");
      })
      .catch(() => setSyncStatus("Waiting to reconnect…"));
  }, [state]);

  useEffect(() => {
    if (!state || !viewerPlayerId) return;
    saveGameSession(state, viewerPlayerId);
    if (!state.winnerId) {
      setSavedSession({ state, viewerPlayerId, savedAt: new Date().toISOString() });
    }
  }, [state, viewerPlayerId]);

  const currentPlayer = state ? state.players[state.currentPlayer] : null;
  const viewer = state && viewerPlayerId ? state.players.find((player) => player.id === viewerPlayerId) ?? null : null;
  const visibleCards = useMemo(() => {
    if (!viewer) return [];
    return viewer.hand.length ? viewer.hand : viewer.foot;
  }, [viewer]);

  useEffect(() => {
    const ids = visibleCards.map((c) => c.id);
    setHandOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !prev.includes(id));
      return [...kept, ...added];
    });
  }, [visibleCards]);

  const orderedVisibleCards = useMemo(
    () => handOrder.map((id) => visibleCards.find((c) => c.id === id)).filter((c): c is Card => c !== undefined),
    [handOrder, visibleCards],
  );

  function startCpuGame(cpuDifficulty: Difficulty) {
    setSelected([]);
    setSelectedMeld("");
    const game = createGame("cpu", deckCount, [
      { name: "You" },
      { name: "Computer", difficulty: cpuDifficulty },
    ]);
    setState(game);
    setViewerPlayerId(game.players[0].id);
    setShowNewGameChoices(false);
    setMessage(`Started game against the Computer.`);
  }

  function startNewCpuGame(cpuDifficulty: Difficulty) {
    if (savedSession && !window.confirm("Start a new game? Your saved game will be replaced.")) return;
    startCpuGame(cpuDifficulty);
  }

  async function continueSavedGame() {
    if (!savedSession) return;
    setSelected([]);
    setSelectedMeld("");
    if (savedSession.state.mode === "online" && savedSession.state.roomCode) {
      if (!authUser) {
        setMessage("Sign in with the same email first, then tap Continue Game.");
        return;
      }
      const room = await fetchRoomByCode(savedSession.state.roomCode);
      if (room) {
        remoteUpdateRef.current = true;
        serverUpdatedAtRef.current = room.updatedAt;
        setState(repairOpeningStatus(room.state));
        setViewerPlayerId(savedSession.viewerPlayerId);
        setSyncStatus("Game restored");
        return;
      }
    }
    setState(repairOpeningStatus(savedSession.state));
    setViewerPlayerId(savedSession.viewerPlayerId);
    setMessage("Game restored.");
  }

  function leaveGame() {
    if (state && !state.winnerId && !window.confirm("Leave this game? You can still continue it from this device later.")) return;
    setState(null);
    setViewerPlayerId(null);
    setSelected([]);
    setSelectedMeld("");
    setMessage("Choose how you would like to play.");
  }

  function update(next: GameState) {
    setState(next);
    setSelected([]);
  }

  function selectedCards() {
    return visibleCards.filter((card) => selected.includes(card.id));
  }

  function onChooseHand(optionIndex: 0 | 1) {
    if (!state || !viewer) return;
    update(chooseStartingHand(state, viewer.id, optionIndex));
  }

  function onCreateMeld() {
    if (!state || !viewer) return;
    update(createMeld(state, viewer.id, selected));
  }

  function onAddToMeld() {
    if (!state || !viewer) return;
    const meldId = selectedMeld || findUniqueAddTarget(viewer.melds, selectedCards());
    if (!meldId) return;
    update(addToMeld(state, viewer.id, meldId, selected));
    setSelectedMeld("");
  }

  function onDiscard() {
    if (!state || !viewer || selected.length !== 1) return;
    update(discardCard(state, viewer.id, selected[0]));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    if (!state || !viewer) return;

    const currentPlayer = state.players[state.currentPlayer];
    const canAct = currentPlayer.id === viewer.id && !viewer.isCpu && !state.winnerId;

    if (over.id === 'discard-pile') {
      const turnMeldPoints = state.turn.playedThisTurn.reduce((sum, card) => sum + cardPoints(card), 0);
      const canDiscard = !state.turn.playedThisTurn.length || viewer.hasGoneDown || turnMeldPoints >= 90;
      const mustDiscard = canAct && state.turn.drawn && viewer.chosenHand && canDiscard;
      
      if (mustDiscard) {
        update(discardCard(state, viewer.id, active.id as string));
      }
      return;
    }

    if (String(over.id).startsWith('meld-')) {
      if (!canPlay) return;
      const meldId = String(over.id).replace('meld-', '');
      const meld = viewer.melds.find((m) => m.id === meldId);
      if (!meld) return;

      const draggedCard = visibleCards.find((c) => c.id === active.id);
      if (!draggedCard) return;

      let cardsToAdd = [draggedCard.id];
      if (selected.includes(draggedCard.id)) {
        if (canAddToMeld(meld, selectedCards())) {
          cardsToAdd = selected;
        } else if (canAddToMeld(meld, [draggedCard])) {
          cardsToAdd = [draggedCard.id];
        } else {
          return;
        }
      } else {
        if (!canAddToMeld(meld, [draggedCard])) return;
      }
      
      update(addToMeld(state, viewer.id, meld.id, cardsToAdd));
      return;
    }

    if (active.id !== over?.id && handOrder.includes(over.id as string)) {
      setHandOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }

  function onUndoBaskets() {
    if (!state || !viewer) return;
    update(undoMeldsThisTurn(state, viewer.id));
  }

  async function shareSupportReport() {
    if (!state) return;
    const logContent = `Hand and Foot Problem Report
App Version: ${APP_VERSION}
Created: ${new Date().toISOString()}
Device: ${navigator.userAgent}
Screen: ${window.innerWidth}x${window.innerHeight}
Room Code: ${state.roomCode || 'N/A'}
Mode: ${state.mode}
ID: ${state.id}
Sync Status: ${syncStatus || 'N/A'}

--- Action Log ---
${state.actionLog ? state.actionLog.join('\n') : 'No actions yet.'}

--- UI State ---
Selected Cards: ${JSON.stringify(selected)}
Selected Meld: ${selectedMeld || 'None'}

--- Full State ---
${JSON.stringify(state, null, 2)}`;
    const file = new File([logContent], `hand_and_foot_report_${state.id}.txt`, { type: "text/plain" });
    const shareData = { title: "Hand and Foot problem report", text: "Please send this report to Ben.", files: [file] };
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        setReportStatus("Problem report shared. Thank you!");
        return;
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
      }
    }
    const dataStr = URL.createObjectURL(file);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", file.name);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(dataStr);
    setReportStatus("Problem report downloaded. Send the file to Ben.");
  }

  const canAct = Boolean(state && currentPlayer && viewer && currentPlayer.id === viewer.id && !viewer.isCpu && !state.winnerId);
  const activeHandLabel = viewer?.hand.length ? "Your Hand" : "Your Foot";
  const opponents = state ? state.players.filter((player) => player.id !== viewer?.id) : [];
  const turnMeldPoints = state?.turn.playedThisTurn.reduce((sum, card) => sum + cardPoints(card), 0) ?? 0;
  const canDiscard = !state?.turn.playedThisTurn.length || viewer?.hasGoneDown || turnMeldPoints >= 90;
  const mustDiscard = Boolean(canAct && state?.turn.drawn && viewer?.chosenHand && canDiscard);
  const canPlay = Boolean(canAct && state?.turn.drawn && viewer?.chosenHand);
  const inferredMeld = !selectedMeld && viewer
    ? findUniqueAddTarget(viewer.melds, selectedCards())
    : null;

  let newBasketTooltip = "";
  if (!canPlay) newBasketTooltip = "You must draw cards first.";
  else if (selected.length < 3) newBasketTooltip = "Select at least 3 cards to make a basket.";
  else if (viewer && viewer.footRevealed && selected.length === visibleCards.length) newBasketTooltip = "You must keep one card to discard to go out.";
  else if (viewer) {
    const verdict = canCreateMeld(selectedCards(), viewer.melds);
    if (!verdict.ok) newBasketTooltip = verdict.reason || "Invalid basket.";
  }

  let addToBasketTooltip = "";
  if (!canPlay) addToBasketTooltip = "You must draw cards first.";
  else if (selected.length === 0) addToBasketTooltip = "Select cards from your hand to add.";
  else if (!selectedMeld && !inferredMeld) addToBasketTooltip = "Choose the basket you want to add these cards to.";
  else if (viewer && viewer.footRevealed && selected.length === visibleCards.length) addToBasketTooltip = "You must keep one card to discard to go out.";
  else if (viewer) {
    const meld = viewer.melds.find(m => m.id === selectedMeld);
    if (meld && !canAddToMeld(meld, selectedCards())) addToBasketTooltip = "Those cards cannot be added to the selected basket.";
  }

  let discardTooltip = "";
  if (!canAct) discardTooltip = "It's not your turn.";
  else if (!state?.turn.drawn) discardTooltip = "You must draw cards first.";
  else if (selected.length !== 1) discardTooltip = "Select exactly one card to discard.";
  else if (viewer && !viewer.hasGoneDown && turnMeldPoints > 0 && turnMeldPoints < 90) discardTooltip = "You cannot end the turn until your first melds total 90 points.";

  const actionGuidance = !canAct
    ? `Waiting for ${currentPlayer?.name ?? "the other player"}.`
    : !state?.turn.drawn
      ? "Draw cards to begin your turn."
      : selected.length === 0
        ? "Tap one or more cards to select them."
        : selectedMeld
          ? `${selected.length} selected. Add them to the highlighted basket or discard one card.`
          : inferredMeld
            ? `${selected.length} selected. Tap Add to Basket to place ${selected.length === 1 ? "it" : "them"} in the matching basket.`
          : `${selected.length} selected. Make a new basket, choose an existing basket, or discard one card.`;

  if (state && currentPlayer && viewer) {
    const isWinner = state.winnerId === viewer.id;
    return (
      <div className="table-shell">
        {isWinner && <VictoryCelebration />}
        <header className="table-header">
          <button className="header-icon-button" onClick={leaveGame} aria-label="Return to home">‹</button>
          <h2>Hand and Foot</h2>
          <div className={`turn-indicator ${canAct ? "is-you" : ""}`}>
            {state.winnerId ? "Game Over!" : canAct ? "Your Turn" : `Waiting for ${currentPlayer.name}...`}
          </div>
          {state.roomCode && <div className="room-code">Room <strong>{state.roomCode}</strong></div>}
          <button
            className="support-button"
            onClick={() => void shareSupportReport()}
            title="Report a Problem"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4"/><path d="M16 2v4"/><rect width="16" height="14" x="4" y="8" rx="2"/><path d="M12 11v6"/><path d="M8 14h8"/><path d="M4 14H2"/><path d="M22 14h-2"/><path d="M4 10H2"/><path d="M22 10h-2"/><path d="M4 18H2"/><path d="M22 18h-2"/>
            </svg>
            <span>Report a Problem</span>
          </button>
        </header>

        <div className="mobile-player-strip">
          {opponents.map((player) => (
            <div key={player.id} className={player.id === currentPlayer.id ? "is-active" : ""}>
              <span className="player-avatar" aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{player.name}</strong><small>{player.hand.length ? `${player.hand.length} in hand` : `${player.foot.length} in foot`}</small></span>
            </div>
          ))}
          <span className="sync-chip">{syncStatus || (state.mode === "cpu" ? "Saved on this phone" : "Connecting…")}</span>
        </div>

        {reportStatus && <div className="report-status" role="status">{reportStatus}</div>}

        {state.lastAction && (
          <div style={{ backgroundColor: '#fef3c7', padding: '8px 16px', textAlign: 'center', fontWeight: 'bold', color: '#92400e', borderBottom: '1px solid #fde68a' }}>
            {state.lastAction}
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <main className="table-felt">
          <div className="table-left-column">
            <section className="opponent-area">
            {opponents.map((player) => (
              <div key={player.id} className={`player-card ${player.id === currentPlayer.id ? "active" : ""}`}>
                <div className="player-name">{player.name}</div>
                <div className="player-stats">Hand: {player.hand.length} | Foot: {player.foot.length}</div>
                <div className="player-stats">{player.hasGoneDown ? "Has gone down" : "Not down yet"}</div>
                <div className="player-stats">Score: {player.score}</div>
                
                <div className="melds-area">
                  {player.melds.map((meld) => <MeldStack key={meld.id} meld={meld} />)}
                </div>
              </div>
            ))}
          </section>

          <section className="center-area">
            <div className="pile">
              <span className="pile-label">Deck</span>
              <button 
                className={`deck-card ${canAct && !state.turn.drawn ? "" : "disabled"}`} 
                onClick={() => canAct && !state.turn.drawn && update(drawFromStock(state))}
                disabled={!canAct || state.turn.drawn}
              >
                <div className="deck-count">{state.stock.length}</div>
                <div>Cards</div>
              </button>
              {canAct && !state.turn.drawn && <div style={{color: '#059669', fontWeight: 'bold'}}>Tap to Draw 2</div>}
            </div>

            <div className="pile">
              <span className="pile-label">Discard Pile</span>
              <DroppableDiscard>
                {state.discard[0] ? (
                  <div style={{display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center'}}>
                    <button 
                      className={`playing-card ${state.discard[0].suit.toLowerCase()} ${canAct && !state.turn.drawn ? "" : "disabled"}`}
                      onClick={() => canAct && !state.turn.drawn && update(pickUpDiscard(state))}
                      disabled={!canAct || state.turn.drawn}
                      style={{ width: '100px', height: '140px' }}
                    >
                      <div>
                        <div className="card-value">{state.discard[0].rank === "JOKER" ? "Jkr" : state.discard[0].rank}</div>
                        <div className="card-suit">{SUIT_SYMBOL[state.discard[0].suit]}</div>
                      </div>
                      <div className="card-center">{SUIT_SYMBOL[state.discard[0].suit]}</div>
                      <div style={{ transform: "rotate(180deg)", alignSelf: "flex-end" }}>
                        <div className="card-value">{state.discard[0].rank === "JOKER" ? "Jkr" : state.discard[0].rank}</div>
                        <div className="card-suit">{SUIT_SYMBOL[state.discard[0].suit]}</div>
                      </div>
                    </button>
                    {canAct && !state.turn.drawn && state.discard.length > 1 && (
                      <button className="btn btn-outline" style={{fontSize: '0.9rem', padding: '8px 12px', width: 'auto'}} onClick={() => update(drawSplit(state))}>
                        Take Top + 1 from Deck
                      </button>
                    )}
                    {canAct && !state.turn.drawn && state.discard.length > 0 && <div style={{color: '#059669', fontWeight: 'bold'}}>Tap card to Pick Up All</div>}
                  </div>
                ) : (
                  <div className="empty-discard">Empty</div>
                )}
              </DroppableDiscard>
            </div>
          </section>
          </div>

          <div className="table-right-column">
          {!viewer.chosenHand && viewer.handChoice ? (
            <div className="overlay">
              <div className="dialog">
                <h2>Choose Your Starting Hand</h2>
                <p>One pile becomes your hand. The other stays facedown as your foot.</p>
                <div className="choice-row">
                  {[1, 2].map((number, index) => (
                    <button key={number} className="choice-btn" onClick={() => onChooseHand(index as 0 | 1)}>
                      Pile {number}
                      <span>7 cards</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
            {viewer.melds.length > 0 && (
              <section className="melds-container">
                <h3>Your Baskets</h3>
                <div className="melds-area">
                  {viewer.melds.map((meld) => (
                    <MeldStack
                      key={meld.id}
                      meld={meld}
                      selectable={canPlay}
                      selected={selectedMeld === meld.id}
                      onSelect={() => setSelectedMeld((current) => current === meld.id ? "" : meld.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="hand-area">
              <div className="hand-header">
                <div>
                  <h3>{activeHandLabel} ({visibleCards.length} cards)</h3>
                  {viewer.foot.length > 0 && <p>Foot: {viewer.foot.length} cards waiting</p>}
                </div>
                <span className={`selection-count ${selected.length ? "has-selection" : ""}`} aria-live="polite">
                  {selected.length ? `${selected.length} selected` : "Tap cards to select"}
                </span>
              </div>

              {canAct && state.turn.drawn && !viewer.hasGoneDown && state.turn.playedThisTurn.length > 0 && turnMeldPoints < 90 && (
                <div style={{ color: '#b45309', fontWeight: 'bold', fontSize: '1rem', textAlign: 'center', marginBottom: '10px' }}>
                  You need 90 points to go down. You have played {turnMeldPoints} points this turn.
                </div>
              )}

              <div className="hand-cards-dnd-wrapper">
                <SortableContext items={handOrder} strategy={rectSortingStrategy}>
                  <div className="hand-cards">
                    {orderedVisibleCards.map((card) => (
                      <SortablePlayingCard
                        key={card.id}
                        card={card}
                        selected={selected.includes(card.id)}
                        onToggle={() => {
                          setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]);
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>

              <div className="action-bar">
                <button 
                  className="btn btn-secondary" 
                  onClick={onCreateMeld} 
                  disabled={!!newBasketTooltip}
                  title={newBasketTooltip}
                >
                  New Basket
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={onAddToMeld} 
                  disabled={!!addToBasketTooltip}
                  title={addToBasketTooltip}
                >
                  Add to Basket
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={onDiscard} 
                  disabled={!!discardTooltip}
                  title={discardTooltip}
                >
                  Discard
                </button>
                {canAct && state.turn.drawn && !viewer.hasGoneDown && state.turn.playedThisTurn.length > 0 && turnMeldPoints < 90 && (
                  <button 
                    className="btn btn-outline" 
                    onClick={onUndoBaskets}
                    style={{color: '#ef4444', borderColor: '#ef4444', gridColumn: '1 / -1'}}
                  >
                    Undo Baskets (Need 90 pts)
                  </button>
                )}
              </div>
              <div className="action-guidance" role="status">{actionGuidance}</div>
            </section>
            </>
          )}
          </div>
          </main>
        </DndContext>
      </div>
    );
  }

  return (
    <div className="shell home-shell">
      <header className="home-hero">
        <div className="brand-mark" aria-hidden="true">H<span>&amp;</span>F</div>
        <div>
          <span className="eyebrow">The family card table</span>
          <h1>Hand &amp; Foot</h1>
          <p className="lede">Big cards, simple choices, and your game waiting whenever you come back.</p>
        </div>
        <InstallHelp />
      </header>

      {message && <div className="banner">{message}</div>}

      {savedSession && !savedSession.state.winnerId && (
        <section className="continue-card">
          <div>
            <span className="eyebrow">Ready when you are</span>
            <h2>Continue your {savedSession.state.mode === "cpu" ? "computer" : "online"} game</h2>
            <p>Saved {new Date(savedSession.savedAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>
          </div>
          <div className="continue-actions">
            <button className="btn" onClick={() => void continueSavedGame()}>Continue Game</button>
            <button
              className="btn continue-new-game"
              onClick={() => setShowNewGameChoices((current) => !current)}
              aria-expanded={showNewGameChoices}
              aria-controls="saved-new-game-options"
            >
              Start New Game
            </button>
            {showNewGameChoices && (
              <div id="saved-new-game-options" className="saved-new-game-options">
                <span>Choose difficulty</span>
                <div className="difficulty-buttons">
                  <button className="btn" onClick={() => startNewCpuGame("easy")}>Easy</button>
                  <button className="btn btn-outline" onClick={() => startNewCpuGame("medium")}>Medium</button>
                  <button className="btn btn-hard" onClick={() => startNewCpuGame("hard")}>Hard</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="setup-grid">
        <div className="panel">
          <span className="panel-icon" aria-hidden="true">♠</span>
          <h2>Practice with the Computer</h2>
          <p>Play at your own pace. Your game is saved on this device.</p>
          <div className="difficulty-buttons" role="group" aria-label="Choose computer difficulty">
            <button className="btn" onClick={() => startNewCpuGame("easy")}>Easy</button>
            <button className="btn btn-outline" onClick={() => startNewCpuGame("medium")}>Medium</button>
            <button className="btn btn-hard" onClick={() => startNewCpuGame("hard")}>Hard</button>
          </div>
        </div>
      </div>
      <GameHistory entries={history} />
      <footer className="home-footer">Hand &amp; Foot Club · {APP_VERSION}</footer>
    </div>
  );
}

export default App;
