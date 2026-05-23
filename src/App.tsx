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
  runCpuTurn,
  undoMeldsThisTurn,
} from "./game/engine";
import { canAddToMeld, canCreateMeld, cardLabel, cardPoints, SUIT_SYMBOL } from "./game/rules";
import { createRoom, fetchFinishedGames, fetchRoomByCode, getSessionUser, joinRoom, recordFinishedGame, signIn, subscribeToRoom, supabase, updateRoomState } from "./lib/supabase";
import type { Card, Difficulty, GameState, Meld } from "./types";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

function PlayingCard({ card, selected, onToggle }: {
  card: Card;
  selected: boolean;
  onToggle: () => void;
}) {
  const rank = card.rank === "JOKER" ? "Jkr" : card.rank;
  const suit = SUIT_SYMBOL[card.suit];
  return (
    <button
      className={`playing-card ${card.suit.toLowerCase()} ${selected ? "selected" : ""}`}
      onClick={onToggle}
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
    </button>
  );
}

function SortablePlayingCard({ card, selected, onToggle }: {
  card: Card;
  selected: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const [isHovered, setIsHovered] = useState(false);

  const zIndex = isDragging ? 50 : (isHovered ? 10 : (selected ? 5 : 1));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : (transition ? `${transition}, z-index 0ms 250ms` : 'z-index 0ms 250ms'),
    touchAction: 'none', // Prevent scrolling on touch devices while dragging
    zIndex,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners} 
      className={isDragging ? 'is-dragging' : ''}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
    >
      <PlayingCard card={card} selected={selected} onToggle={onToggle} />
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
        <span>{meld.type === "set" ? "Set" : "Run"}</span>
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
    <div
      ref={setNodeRef}
      className={`meld-stack ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      onClick={selectable ? onSelect : undefined}
      style={{ outline: isOver ? '4px solid #3b82f6' : 'none' }}
    >
      {body}
    </div>
  );
}

function App() {
  const remoteUpdateRef = useRef(false);
  const [email, setEmail] = useState("");
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [viewerPlayerId, setViewerPlayerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedMeld, setSelectedMeld] = useState<string>("");
  const [deckCount, setDeckCount] = useState(3);
  const [onlineName, setOnlineName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("Welcome! Tap a button below to get started.");
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; scores: Array<{ id: string; name: string; score: number }> }>>([]);
  const [handOrder, setHandOrder] = useState<string[]>([]);

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
    void getSessionUser().then((user) => {
      if (user) {
        setAuthUser(user.id);
        setEmail(user.email ?? "");
      }
    });
    void fetchFinishedGames().then(setHistory);
  }, []);

  useEffect(() => {
    if (!state?.winnerId) return;
    void recordFinishedGame(state.mode === "online" ? state.id : null, authUser, state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
    }))).then(() => fetchFinishedGames().then(setHistory));
  }, [state?.winnerId, authUser]);

  useEffect(() => {
    if (!state || state.mode !== "online") return;
    return subscribeToRoom(state.id, (remoteState) => {
      remoteUpdateRef.current = true;
      setState(remoteState);
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
    void updateRoomState(state.id, state);
  }, [state]);

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
    setMessage(`Started game against the Computer.`);
  }

  async function startOnlineGame() {
    if (!authUser) {
      setMessage("Please sign in first to play online.");
      return;
    }
    const roomCode = randomRoomCode();
    const game = createGame("online", deckCount, [{ name: onlineName }, { name: "Mom" }], roomCode);
    await createRoom(roomCode, authUser, game);
    await joinRoom(game.id, authUser, 0);
    setState(game);
    setViewerPlayerId(game.players[0].id);
    setMessage(`Room ${roomCode} created. Share this code!`);
  }

  async function handleJoinRoom() {
    if (!authUser) {
      setMessage("Please sign in first to join.");
      return;
    }
    const room = await fetchRoomByCode(joinCode.toUpperCase());
    if (!room) {
      setMessage("Room not found. Check the code.");
      return;
    }
    await joinRoom(room.id, authUser, 1);
    setState(room.state);
    setViewerPlayerId(room.state.players[1]?.id ?? null);
    setMessage(`Joined room ${joinCode.toUpperCase()}.`);
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
    if (!state || !viewer || !selectedMeld) return;
    update(addToMeld(state, viewer.id, selectedMeld, selected));
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

  async function onEmailSignIn() {
    await signIn(email);
    setMessage(`Check your email! We sent a login link to ${email}.`);
  }

  const canAct = Boolean(state && currentPlayer && viewer && currentPlayer.id === viewer.id && !viewer.isCpu && !state.winnerId);
  const activeHandLabel = viewer?.hand.length ? "Your Hand" : "Your Foot";
  const opponents = state ? state.players.filter((player) => player.id !== viewer?.id) : [];
  const turnMeldPoints = state?.turn.playedThisTurn.reduce((sum, card) => sum + cardPoints(card), 0) ?? 0;
  const canDiscard = !state?.turn.playedThisTurn.length || viewer?.hasGoneDown || turnMeldPoints >= 90;
  const mustDiscard = Boolean(canAct && state?.turn.drawn && viewer?.chosenHand && canDiscard);
  const canPlay = Boolean(canAct && state?.turn.drawn && viewer?.chosenHand);

  if (state && currentPlayer && viewer) {
    return (
      <div className="table-shell">
        <header className="table-header">
          <h2>Hand and Foot</h2>
          <div className={`turn-indicator ${canAct ? "is-you" : ""}`}>
            {state.winnerId ? "Game Over!" : canAct ? "Your Turn" : `Waiting for ${currentPlayer.name}...`}
          </div>
          {state.roomCode && <div>Room Code: <strong>{state.roomCode}</strong></div>}
        </header>

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
                      selectable={canPlay && selected.length > 0}
                      selected={selectedMeld === meld.id}
                      onSelect={() => setSelectedMeld(meld.id)}
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
              </div>

              {canAct && state.turn.drawn && !viewer.hasGoneDown && state.turn.playedThisTurn.length > 0 && turnMeldPoints < 90 && (
                <div style={{ color: '#b45309', fontWeight: 'bold', fontSize: '1rem', textAlign: 'center', marginBottom: '10px' }}>
                  You need 90 points to go down. You have played {turnMeldPoints} points this turn.
                </div>
              )}

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={handOrder} strategy={rectSortingStrategy}>
                  <div className="hand-cards">
                    {orderedVisibleCards.map((card) => (
                      <SortablePlayingCard
                        key={card.id}
                        card={card}
                        selected={selected.includes(card.id)}
                        onToggle={() => {
                          setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]);
                          setSelectedMeld(""); // Reset meld selection if cards change
                        }}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <div className="action-bar">
                <button 
                  className="btn btn-secondary" 
                  onClick={onCreateMeld} 
                  disabled={!canPlay || selected.length < 3 || !canCreateMeld(selectedCards()).ok || (viewer.footRevealed && selected.length === visibleCards.length)}
                >
                  New Basket
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={onAddToMeld} 
                  disabled={!canPlay || !selectedMeld || selected.length === 0 || !canAddToMeld(viewer.melds.find(m => m.id === selectedMeld)!, selectedCards()) || (viewer.footRevealed && selected.length === visibleCards.length)}
                >
                  Add to Basket
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={onDiscard} 
                  disabled={!mustDiscard || selected.length !== 1}
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
            </section>
            </>
          )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <h1>Hand and Foot</h1>
      <p className="lede">
        Play online with friends or against the computer!
      </p>

      {message && <div className="banner">{message}</div>}

      <div className="setup-grid">
        <div className="panel">
          <h2>Play against Computer</h2>
          <button className="btn" onClick={() => startCpuGame("easy")}>Play (Easy)</button>
          <button className="btn btn-outline" onClick={() => startCpuGame("medium")}>Play (Medium)</button>
        </div>

        <div className="panel">
          <h2>Play with Mom (Online)</h2>
          {!authUser ? (
            <div>
              <label>Enter your email to login:</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" />
              <button className="btn" onClick={() => void onEmailSignIn()} disabled={!email}>Send Login Link</button>
            </div>
          ) : (
            <div>
              <label>Your Name in the Game:</label>
              <input value={onlineName} onChange={(e) => setOnlineName(e.target.value)} placeholder="e.g. Grandma" />
              <button className="btn" onClick={() => void startOnlineGame()} disabled={!onlineName}>Create a New Game Room</button>
              
              <hr style={{margin: '20px 0', border: '1px solid #e5e7eb'}}/>
              
              <label>Or enter a code to join:</label>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" />
              <button className="btn btn-secondary" onClick={() => void handleJoinRoom()} disabled={!joinCode}>Join Game</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
