import { describe, expect, it } from "vitest";
import type { Card, GameState, Rank, Suit } from "../types";
import { runCpuTurn, undoMeldsThisTurn } from "./engine";

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
    const played = [card("4h", "4", "hearts"), card("5h", "5", "hearts"), card("6h", "6", "hearts")];
    const state: GameState = {
      ...baseState(),
      players: [{
        id: "P1", name: "You", isCpu: false, chosenHand: true,
        hand: [], foot: [card("9c", "9")], footRevealed: true, hasGoneDown: false,
        melds: [{ id: "run", type: "run", suit: "hearts", cards: [...played] }], score: 0,
      }],
      turn: { drawn: true, source: "stock", pickedDiscard: false, playedThisTurn: [...played], startedTurnInFoot: true },
    };

    const undone = undoMeldsThisTurn(state, "P1");
    expect(undone.players[0].hand).toHaveLength(0);
    expect(undone.players[0].foot.map((entry) => entry.id)).toEqual(expect.arrayContaining(["4h", "5h", "6h", "9c"]));
    expect(undone.players[0].melds).toHaveLength(0);
  });

  it("lets hard CPU create suited runs as well as sets", () => {
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
    expect(next.players[0].melds.some((meld) => meld.type === "run" && meld.suit === "hearts")).toBe(true);
  });
});
