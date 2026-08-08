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
