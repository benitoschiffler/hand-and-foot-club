import { describe, expect, it } from "vitest";
import type { Card, Meld, Rank, Suit } from "../types";
import { canAddToMeld, canCreateMeld, cardPoints, detectMeldType } from "./rules";

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
});
