import { describe, expect, it } from "vitest";
import type { Card, Meld, Rank, Suit } from "../types";
import { canAddToMeld, canCreateMeld, cardPoints, detectMeldType, findUniqueAddTarget } from "./rules";

function card(id: string, rank: Rank, suit: Suit = "clubs"): Card {
  return { id, rank, suit, deck: 1 };
}

describe("house rules", () => {
  it("scores the custom high-penalty red threes", () => {
    expect(cardPoints(card("red-three", "3", "hearts"))).toBe(300);
    expect(cardPoints(card("black-three", "3", "spades"))).toBe(15);
  });

  it("creates a natural set and rejects bad threes", () => {
    const set = [card("a", "8"), card("b", "8", "hearts"), card("c", "8", "spades")];
    expect(canCreateMeld(set).ok).toBe(true);
    expect(canCreateMeld([...set.slice(0, 2), card("bad", "3")]).ok).toBe(false);
  });

  it("uses wild cards to fill a suited run", () => {
    const run = [card("four", "4", "hearts"), card("six", "6", "hearts"), card("wild", "2", "diamonds")];
    expect(detectMeldType(run)).toBe("run");
  });

  it("allows adding only matching cards to a set", () => {
    const meld: Meld = {
      id: "meld",
      type: "set",
      rank: "Q",
      cards: [card("q1", "Q"), card("q2", "Q", "hearts"), card("q3", "Q", "spades")],
    };
    expect(canAddToMeld(meld, [card("q4", "Q", "diamonds")])).toBe(true);
    expect(canAddToMeld(meld, [card("k", "K")])).toBe(false);
  });

  it("finds the only compatible basket for a selected card", () => {
    const queens: Meld = {
      id: "queens",
      type: "set",
      rank: "Q",
      cards: [card("q1", "Q"), card("q2", "Q", "hearts"), card("q3", "Q", "spades")],
    };
    const sevens: Meld = {
      id: "sevens",
      type: "set",
      rank: "7",
      cards: [card("s1", "7"), card("s2", "7", "hearts"), card("s3", "7", "spades")],
    };

    expect(findUniqueAddTarget([queens, sevens], [card("s4", "7", "diamonds")])).toBe("sevens");
  });

  it("requires an explicit choice when more than one basket is compatible", () => {
    const first: Meld = {
      id: "first",
      type: "set",
      rank: "7",
      cards: [card("a1", "7"), card("a2", "7", "hearts"), card("a3", "7", "spades")],
    };
    const second: Meld = {
      id: "second",
      type: "set",
      rank: "7",
      cards: [card("b1", "7"), card("b2", "7", "hearts"), card("wild", "2")],
    };

    expect(findUniqueAddTarget([first, second], [card("s4", "7", "diamonds")])).toBeNull();
  });
});
