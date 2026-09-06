import { describe, expect, it } from "vitest";
import type { Card, GameState, Rank, Suit } from "../types";
import { addToMeld, repairOpeningStatus, runCpuTurn, undoMeldsThisTurn } from "./engine";

function card(id: string, rank: Rank, suit: Suit = "clubs"): Card {
  return { id, rank, suit, deck: 1 };
}

function baseState(): GameState {
  return {
    id: "test-game",
    mode: "cpu",
    deckCount: 1,
    players: [],
    stock: [],
    discard: [],
    currentPlayer: 0,
    started: true,
    turn: { drawn: false, source: null, pickedDiscard: false, playedThisTurn: [] },
    lastAction: "Test",
    actionLog: [],
  };
}

describe("game engine regressions", () => {
  it("returns undone cards to the foot when the turn began in the foot", () => {
    const played = [card("4c", "4"), card("4h", "4", "hearts"), card("4s", "4", "spades")];
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [], foot: [card("9c", "9")], footRevealed: true, hasGoneDown: false,
        melds: [{ id: "fours", type: "set", rank: "4", cards: [...played] }], score: 0,
      }],
      turn: { drawn: true, source: "stock", pickedDiscard: false, playedThisTurn: [...played], startedTurnInFoot: true },
    };

    const undone = undoMeldsThisTurn(state, "P1");
    expect(undone.players[0].hand).toHaveLength(0);
    expect(undone.players[0].foot.map((entry) => entry.id)).toEqual(expect.arrayContaining(["4c", "4h", "4s", "9c"]));
    expect(undone.players[0].melds).toHaveLength(0);
  });

  it("marks a player down when adding to a basket reaches the 90-point opening", () => {
    const openingCards = [card("10c", "10"), card("10d", "10", "diamonds"), card("10h", "10", "hearts")];
    const addedAces = [card("ac2", "A"), card("ad2", "A", "diamonds"), card("ah2", "A", "hearts")];
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [...addedAces, card("9c", "9")], foot: [], footRevealed: false, hasGoneDown: false,
        melds: [{
          id: "aces",
          type: "set",
          rank: "A",
          cards: [card("ac1", "A"), card("ad1", "A", "diamonds"), card("ah1", "A", "hearts")],
        }],
        score: 0,
      }],
      turn: {
        drawn: true,
        source: "stock",
        pickedDiscard: false,
        playedThisTurn: openingCards,
        startedTurnInFoot: false,
      },
    };

    const next = addToMeld(state, "P1", "aces", addedAces.map((entry) => entry.id));

    expect(next.turn.playedThisTurn).toHaveLength(6);
    expect(next.players[0].hasGoneDown).toBe(true);
  });

  it("repairs an older save when a completed-turn basket proves the player went down", () => {
    const previousBasket = [card("7c", "7"), card("7d", "7", "diamonds"), card("7h", "7", "hearts")];
    const currentBasket = [card("kc", "K"), card("kd", "K", "diamonds"), card("kh", "K", "hearts")];
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [card("9c", "9")], foot: [], footRevealed: false, hasGoneDown: false,
        melds: [
          { id: "sevens", type: "set", rank: "7", cards: previousBasket },
          { id: "kings", type: "set", rank: "K", cards: currentBasket },
        ],
        score: 0,
      }],
      turn: {
        drawn: true,
        source: "stock",
        pickedDiscard: false,
        playedThisTurn: currentBasket,
        startedTurnInFoot: false,
      },
    };

    const repaired = repairOpeningStatus(state);

    expect(repaired.players[0].hasGoneDown).toBe(true);
    expect(state.players[0].hasGoneDown).toBe(false);
  });

  it("does not mark a player down while all baskets are still from the current turn", () => {
    const currentBasket = [card("4c", "4"), card("4d", "4", "diamonds"), card("4h", "4", "hearts")];
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [card("9c", "9")], foot: [], footRevealed: false, hasGoneDown: false,
        melds: [{ id: "fours", type: "set", rank: "4", cards: currentBasket }],
        score: 0,
      }],
      turn: {
        drawn: true,
        source: "stock",
        pickedDiscard: false,
        playedThisTurn: currentBasket,
        startedTurnInFoot: false,
      },
    };

    expect(repairOpeningStatus(state).players[0].hasGoneDown).toBe(false);
  });

  it("does not let the hard CPU create a same-suit run", () => {
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "Computer", isCpu: true, difficulty: "hard", chosenHand: true,
        hand: [card("4h", "4", "hearts"), card("5h", "5", "hearts"), card("6h", "6", "hearts"), card("9c", "9")],
        foot: [], footRevealed: false, hasGoneDown: true, melds: [], score: 0,
      }],
      stock: [card("7c", "7"), card("8d", "8", "diamonds")],
    };

    const next = runCpuTurn(state);
    expect(next.players[0].melds).toHaveLength(0);
  });

  it("repairs the reported legacy run by returning its cards to the hand", () => {
    const legacyRun = [
      card("wild", "2", "diamonds"),
      card("king", "K"),
      card("queen", "Q"),
      card("jack", "J"),
      card("ten", "10"),
      card("eight", "8"),
    ];
    const state = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [card("nine", "9")], foot: [], footRevealed: false, hasGoneDown: true,
        melds: [{ id: "legacy-run", type: "run", suit: "clubs", cards: legacyRun }], score: 0,
      }],
      turn: { drawn: true, source: "stock", pickedDiscard: false, playedThisTurn: legacyRun, startedTurnInFoot: false },
    } as unknown as GameState;

    const repaired = repairOpeningStatus(state);

    expect(repaired.players[0].melds).toHaveLength(0);
    expect(repaired.players[0].hand.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["wild", "king", "queen", "jack", "ten", "eight", "nine"]),
    );
    expect(repaired.turn.playedThisTurn).toHaveLength(0);
    expect(repaired.players[0].hasGoneDown).toBe(false);
    expect(repaired.lastAction).toContain("same rank");
  });
});

import { createCpuGame, chooseStartingHand, drawFromStock, discardCard } from "./engine";

function expertState(hand: Card[], down = true): GameState {
  const state = chooseStartingHand(createCpuGame("expert"), "P1", 0);
  state.currentPlayer = 1;
  Object.assign(state.players[1], { hand, foot: [card("foot", "8")], hasGoneDown: down });
  state.stock = [card("draw1", "4"), card("draw2", "6")];
  return state;
}

describe("CPU tables and Expert strategy", () => {
  it.each([1, 2, 3])("deals a complete, unique scaled deck for %i opponents and rotates back to the human", count => {
    let state = chooseStartingHand(createCpuGame("expert", count), "P1", 0);
    expect(state.deckCount).toBe(count + 2);
    expect(state.players).toHaveLength(count + 1);
    expect(state.players.slice(1).every(p => p.difficulty === "expert" && p.chosenHand)).toBe(true);
    const all = [...state.stock, ...state.players.flatMap(p => [...p.hand, ...p.foot])];
    expect(all).toHaveLength((count + 2) * 54);
    expect(new Set(all.map(c => c.id)).size).toBe(all.length);
    state = drawFromStock(state);
    state = discardCard(state, "P1", state.players[0].hand[0].id);
    for (let i = 1; i <= count; i++) {
      expect(state.currentPlayer).toBe(i);
      state = runCpuTurn(state);
    }
    expect(state.currentPlayer).toBe(0);
    expect(state.turn.drawn).toBe(false);
  });

  it("rejects CPU tables outside the 2–4 player limit", () => {
    for (const count of [0, 4, 1.5, NaN]) expect(() => createCpuGame("expert", count)).toThrow();
  });

  it("cannot add cards to an opponent's basket", () => {
    const state = expertState([card("mine", "K")]);
    state.players[0].melds = [{ id: "theirs", type: "set", rank: "K", cards: [card("k1", "K"), card("k2", "K"), card("k3", "K")] }];
    expect(addToMeld(state, "P2", "theirs", ["mine"])).toEqual(state);
  });

  it("opens with 90 points by using extra wilds that Hard leaves unused", () => {
    const state = expertState([card("a1", "A"), card("a2", "A"), card("w1", "2"), card("w2", "2"), card("w3", "JOKER")], false);
    const hard = structuredClone(state); hard.players[1].difficulty = "hard";
    expect(runCpuTurn(hard).players[1].hasGoneDown).toBe(false);
    const next = runCpuTurn(state);
    expect(next.players[1].hasGoneDown).toBe(true);
    expect(next.players[1].melds[0].cards).toHaveLength(5);
  });

  it("preserves a useful pair instead of discarding the lowest card", () => {
    const state = expertState([card("four1", "4"), card("four2", "4"), card("king", "K")]);
    state.stock = [card("eight", "8"), card("nine", "9")];
    const next = runCpuTurn(state);
    expect(next.discard[0].rank).toBe("K");
    expect(next.players[1].hand.filter(c => c.rank === "4")).toHaveLength(2);
  });

  it("takes top plus stock instead of collecting a pile of penalty threes", () => {
    const state = expertState([card("nine", "9")]);
    state.players[1].melds = [{ id: "kings", type: "set", rank: "K", cards: [card("k1", "K"), card("k2", "K"), card("k3", "K")] }];
    state.discard = [card("top", "K"), card("bad1", "3", "hearts"), card("bad2", "3", "diamonds")];
    const next = runCpuTurn(state);
    expect(next.actionLog?.some(a => a.includes("1 from discard"))).toBe(true);
    expect(next.players[1].melds[0].cards.some(c => c.id === "top")).toBe(true);
    expect(next.discard.some(c => c.id === "bad1")).toBe(true);
  });

  it("keeps a final discard and scores all opponents when going out", () => {
    const state = expertState([card("x", "4")]);
    Object.assign(state.players[1], { hand: [], foot: [card("k4", "K")], footRevealed: true });
    state.players[1].melds = [{ id: "kings", type: "set", rank: "K", cards: [card("k1", "K"), card("k2", "K"), card("k3", "K")] }];
    state.stock = [card("k5", "K"), card("k6", "K")];
    const next = runCpuTurn(state);
    expect(next.winnerId).toBe("P2");
    expect(next.discard[0].rank).toBe("K");
    expect(next.players[0].score).toBeGreaterThan(0);
    expect(next.players[1].score).toBe(0);
  });
});
