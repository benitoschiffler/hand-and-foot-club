import { useEffect, useMemo, useRef, useState } from "react";
import {
  addToMeld,
  chooseStartingHand,
  createGame,
  createMeld,
  discardCard,
  drawFromStock,
  pickUpDiscard,
  runCpuTurn,
} from "./game/engine";
import { cardLabel, SUIT_SYMBOL } from "./game/rules";
import { createRoom, fetchFinishedGames, fetchRoomByCode, getSessionUser, joinRoom, recordFinishedGame, signIn, subscribeToRoom, supabase, updateRoomState } from "./lib/supabase";
import type { Card, Difficulty, GameState, Meld } from "./types";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomRoomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)]).join("");
}

function HandCard({ card, selected, mustDiscard, onToggle, onDiscard }: {
  card: Card;
  selected: boolean;
  mustDiscard: boolean;
  onToggle: () => void;
  onDiscard: () => void;
}) {
  return (
    <button
      className={`card ${card.suit} ${selected ? "selected" : ""} ${mustDiscard ? "discard-ready" : ""}`}
      onClick={onToggle}
    >
      <div className="card-corner">
        <span className="card-rank">{card.rank === "JOKER" ? "Jkr" : card.rank}</span>
        <span className="card-suit-sym">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <span className="card-pip">{SUIT_SYMBOL[card.suit]}</span>
      <div className="card-corner card-corner-br">
        <span className="card-rank">{card.rank === "JOKER" ? "Jkr" : card.rank}</span>
        <span className="card-suit-sym">{SUIT_SYMBOL[card.suit]}</span>
      </div>
      <em
        className="card-discard"
        onClick={(event) => {
          event.stopPropagation();
          onDiscard();
        }}
      >
        {mustDiscard ? "Discard now" : "Discard"}
      </em>
    </button>
  );
}

function MeldStack({ meld, selectable, selected, onSelect }: { meld: Meld; selectable?: boolean; selected?: boolean; onSelect?: () => void }) {
  const body = (
    <>
      <div className="meld-stack-head">
        <strong>{meld.type === "set" ? "Set" : "Run"}</strong>
        <span>{meld.cards.length} cards</span>
      </div>
      <div className="meld-fan">
        {meld.cards.map((card, index) => (
          <div
            key={card.id}
            className={`mini-card ${card.suit}`}
            style={{ left: `${index * 26}px`, zIndex: index + 1 }}
            title={cardLabel(card)}
          >
            <div className="mini-corner">
              <span className="mini-rank">{card.rank === "JOKER" ? "Jkr" : card.rank}</span>
              <small className="mini-suit-sym">{SUIT_SYMBOL[card.suit]}</small>
            </div>
            <span className="mini-pip">{SUIT_SYMBOL[card.suit]}</span>
            <div className="mini-corner mini-corner-br">
              <span className="mini-rank">{card.rank === "JOKER" ? "Jkr" : card.rank}</span>
              <small className="mini-suit-sym">{SUIT_SYMBOL[card.suit]}</small>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (!selectable) {
    return <div className="table-meld-stack">{body}</div>;
  }

  return (
    <button className={`table-meld-stack selectable ${selected ? "selected" : ""}`} onClick={onSelect}>
      {body}
    </button>
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
  const [deckCount, setDeckCount] = useState(2);
  const [onlineName, setOnlineName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("Use your house rules as the source of truth.");
  const [history, setHistory] = useState<Array<{ id: string; created_at: string; scores: Array<{ id: string; name: string; score: number }> }>>([]);

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
    if (!state?.winnerId) {
      return;
    }
    void recordFinishedGame(state.mode === "online" ? state.id : null, authUser, state.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
    }))).then(() => fetchFinishedGames().then(setHistory));
  }, [state?.winnerId, authUser]);

  useEffect(() => {
    if (!state || state.mode !== "online") {
      return;
    }
    return subscribeToRoom(state.id, (remoteState) => {
      remoteUpdateRef.current = true;
      setState(remoteState);
    });
  }, [state?.id, state?.mode]);

  useEffect(() => {
    if (!state) {
      return;
    }
    const current = state.players[state.currentPlayer];
    if (!current?.isCpu || state.winnerId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setState((previous) => (previous ? runCpuTurn(previous) : previous));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!state || state.mode !== "online") {
      return;
    }
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    void updateRoomState(state.id, state);
  }, [state]);

  const currentPlayer = state ? state.players[state.currentPlayer] : null;
  const viewer = state && viewerPlayerId ? state.players.find((player) => player.id === viewerPlayerId) ?? null : null;
  const visibleCards = useMemo(() => {
    if (!viewer) {
      return [];
    }
    return viewer.hand.length ? viewer.hand : viewer.foot;
  }, [viewer]);

  function startCpuGame(cpuDifficulty: Difficulty) {
    setSelected([]);
    setSelectedMeld("");
    const game = createGame("cpu", deckCount, [
      { name: "You" },
      { name: cpuDifficulty.toUpperCase(), difficulty: cpuDifficulty },
    ]);
    setState(game);
    setViewerPlayerId(game.players[0].id);
    setMessage(`Started a ${cpuDifficulty} CPU game.`);
  }

  async function startOnlineGame() {
    if (!authUser) {
      setMessage("Sign in first to use online rooms.");
      return;
    }
    const roomCode = randomRoomCode();
    const game = createGame("online", deckCount, [{ name: onlineName }, { name: "Mom" }], roomCode);
    await createRoom(roomCode, authUser, game);
    await joinRoom(game.id, authUser, 0);
    setState(game);
    setViewerPlayerId(game.players[0].id);
    setMessage(`Room ${roomCode} created.`);
  }

  async function handleJoinRoom() {
    if (!authUser) {
      setMessage("Sign in first to join a room.");
      return;
    }
    const room = await fetchRoomByCode(joinCode.toUpperCase());
    if (!room) {
      setMessage("Room not found.");
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
    if (!state || !viewer) {
      return;
    }
    update(chooseStartingHand(state, viewer.id, optionIndex));
  }

  function onCreateMeld() {
    if (!state || !viewer) {
      return;
    }
    update(createMeld(state, viewer.id, selected));
  }

  function onAddToMeld() {
    if (!state || !viewer || !selectedMeld) {
      return;
    }
    update(addToMeld(state, viewer.id, selectedMeld, selected));
  }

  function onDiscard(cardId: string) {
    if (!state || !viewer) {
      return;
    }
    update(discardCard(state, viewer.id, cardId));
  }

  async function onEmailSignIn() {
    await signIn(email);
    setMessage(`Magic link sent to ${email}.`);
  }

  const canAct = Boolean(state && currentPlayer && viewer && currentPlayer.id === viewer.id && !viewer.isCpu && !state.winnerId);
  const activeHandLabel = viewer?.hand.length ? "Hand" : "Foot";
  const opponents = state ? state.players.filter((player) => player.id !== viewer?.id) : [];
  const mustDiscard = Boolean(canAct && state?.turn.drawn && viewer?.chosenHand);

  if (state && currentPlayer && viewer) {
    return (
      <div className="table-shell">
        <main className="table-stage">
          <section className="table-felt">
            <div className="table-hud">
              <div>
                <p className="eyebrow">Hand and Foot Club</p>
                <h2 className="table-title">{state.roomCode ? `Room ${state.roomCode}` : "CPU Table"}</h2>
              </div>
              <div className="table-meta">
                <span className="pill">Turn: {currentPlayer.name}</span>
                <span className="pill">Stock: {state.stock.length}</span>
                <span className="pill">Discard: {state.discard[0] ? cardLabel(state.discard[0]) : "none"}</span>
              </div>
            </div>

            <div className="opponent-row">
              {opponents.map((player) => (
                <div key={player.id} className="opponent-zone">
                  <article className={`seat seat-opponent ${player.id === currentPlayer.id ? "active" : ""}`}>
                    <div className="seat-name">{player.name}</div>
                    <div className="seat-stack">Hand: {player.hand.length || 0}</div>
                    <div className="seat-stack">Foot: {player.foot.length || 0}</div>
                    <div className="seat-state">{player.hasGoneDown ? "Down" : "Not down"}</div>
                  </article>
                  <div className="table-meld-strip">
                    {player.melds.length ? (
                      player.melds.map((meld) => <MeldStack key={meld.id} meld={meld} />)
                    ) : (
                      <div className="table-meld-stack empty">No melds down</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="center-lane">
              <div className="deck-cluster">
                <div className="deck-well">
                  <strong>Stock</strong>
                  <span>{state.stock.length} cards</span>
                </div>
                <div className="deck-well discard-well">
                  <strong>Discard</strong>
                  <span>{state.discard[0] ? cardLabel(state.discard[0]) : "Empty"}</span>
                </div>
              </div>

              <aside className="table-side">
                <div className="panel side-panel">
                  <h3>Your melds</h3>
                  {viewer.melds.map((meld: Meld) => (
                    <MeldStack
                      key={meld.id}
                      meld={meld}
                      selectable
                      selected={selectedMeld === meld.id}
                      onSelect={() => setSelectedMeld(meld.id)}
                    />
                  ))}
                  {!viewer.melds.length ? <p className="muted">No melds yet.</p> : null}
                </div>

                <div className="panel side-panel compact">
                  <h3>Your foot</h3>
                  <div className="foot-card">{viewer.footRevealed ? `${viewer.foot.length} cards` : "Facedown"}</div>
                  <p className="muted">{selectedCards().map(cardLabel).join(", ") || "Nothing selected"}</p>
                </div>

                <div className="panel side-panel compact">
                  <h3>Scoreboard</h3>
                  <div className="score-list">
                    {state.players.map((player) => (
                      <div key={player.id} className="score-row">
                        <span>{player.id === viewer.id ? "You" : player.name}</span>
                        <span>{player.score || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            <div className={`seat seat-you ${viewer.id === currentPlayer.id ? "active" : ""}`}>
              <div>
                <div className="seat-name">You</div>
                <div className="seat-stack">{activeHandLabel}: {visibleCards.length} cards</div>
                <div className="seat-state">{viewer.hasGoneDown ? "Down" : "Not down"}</div>
              </div>
              <div className="status-ribbon">{state.lastAction}</div>
            </div>

            {!viewer.chosenHand && viewer.handChoice ? (
              <div className="choice-overlay">
                <div className="choice-dialog">
                  <p className="eyebrow">Starting hand</p>
                  <h2>Choose pile 1 or pile 2</h2>
                  <p className="muted">One pile becomes your hand. The other stays facedown as your foot.</p>
                  <div className="choice-grid">
                    {[1, 2].map((number, index) => (
                      <button key={number} className="choice facedown-choice" onClick={() => onChooseHand(index as 0 | 1)}>
                        <span>Pile {number}</span>
                        <strong>7 facedown cards</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="table-controls">
                  {!canAct ? <p className="muted turn-note">Waiting for {currentPlayer.name}.</p> : null}
                  {mustDiscard ? <p className="turn-note discard-note">Choose one card to discard and end your turn.</p> : null}
                  <div className="button-row">
                    <button onClick={() => canAct && update(drawFromStock(state))} disabled={!canAct || state.turn.drawn}>
                      Draw 2
                    </button>
                    <button onClick={() => canAct && update(pickUpDiscard(state))} disabled={!canAct || state.turn.drawn || !state.discard.length}>
                      Pick up discard
                    </button>
                    <button onClick={onCreateMeld} disabled={!canAct || selected.length < 3}>
                      Create meld
                    </button>
                    <button onClick={onAddToMeld} disabled={!canAct || !selectedMeld || !selected.length}>
                      Add to meld
                    </button>
                  </div>
                </div>

                <section className="hand-area">
                  <div className="hand-header">
                    <h3>{activeHandLabel}</h3>
                    <p className="muted">Select cards to meld, then discard one to end the turn.</p>
                  </div>
                  <div className="cards hand-cards">
                    {visibleCards.map((card) => (
                      <HandCard
                        key={card.id}
                        card={card}
                        selected={selected.includes(card.id)}
                        mustDiscard={mustDiscard}
                        onToggle={() =>
                          setSelected((current) =>
                            current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id],
                          )
                        }
                        onDiscard={() => onDiscard(card.id)}
                      />
                    ))}
                  </div>
                </section>
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Hand and Foot Club</p>
          <h1>Play your version online or against the CPU.</h1>
          <p className="lede">
            Based on Bicycle for structure, but this app follows your house rules first: 7-card hand choice, 90-point go-down,
            runs by suit, wild 2s and Jokers, and end scoring by leftover cards only.
          </p>
        </div>
        <div className="panel auth">
          <h2>Login</h2>
          <p className="muted">Magic link email through Supabase. CPU mode works without login.</p>
          <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <button onClick={() => void onEmailSignIn()} disabled={!supabase || !email}>
            Send magic link
          </button>
          <div className="status">{authUser ? "Signed in" : supabase ? "Not signed in" : "Supabase not configured"}</div>
        </div>
      </header>

      <section className="setup-grid">
        <div className="panel">
          <h2>Start a game</h2>
          <label>
            Decks in play
            <input type="number" min={2} max={8} value={deckCount} onChange={(event) => setDeckCount(Number(event.target.value))} />
          </label>
          <div className="button-row">
            <button onClick={() => startCpuGame("easy")}>CPU Easy</button>
            <button onClick={() => startCpuGame("medium")}>CPU Medium</button>
            <button onClick={() => startCpuGame("hard")}>CPU Hard</button>
          </div>
        </div>

        <div className="panel">
          <h2>Online room</h2>
          <label>
            Your name
            <input value={onlineName} onChange={(event) => setOnlineName(event.target.value)} />
          </label>
          <div className="button-row">
            <button onClick={() => void startOnlineGame()} disabled={!onlineName}>Create room</button>
          </div>
          <label>
            Join by code
            <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" />
          </label>
          <button onClick={() => void handleJoinRoom()} disabled={!joinCode}>Join room</button>
        </div>

        <div className="panel">
          <h2>Rule snapshot</h2>
          <ul className="plain-list">
            <li>Draw 2 each turn or pick up the whole discard pile.</li>
            <li>If the discard pile has only 1 card, also draw 1 from stock.</li>
            <li>New melds: at least 3 cards and at least 15 points.</li>
            <li>First time down: at least 90 points in that turn.</li>
            <li>3s are always bad and cannot be melded.</li>
            <li>Winner scores 0; other players score leftover unplayed cards.</li>
          </ul>
        </div>
      </section>

      <div className="banner">{message}</div>

      {history.length ? (
        <section className="panel history-panel">
          <div className="table-top">
            <h2>All-time recent scores</h2>
            <p className="muted">Lower is better.</p>
          </div>
          <div className="history-list">
            {history.map((game) => (
              <article key={game.id} className="history-item">
                <strong>{new Date(game.created_at).toLocaleDateString()}</strong>
                <span>{game.scores.map((entry) => `${entry.name}: ${entry.score}`).join(" | ")}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default App;
