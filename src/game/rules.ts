import type { Card, Meld, Rank, Suit } from "../types";

export const RANK_ORDER: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "JOKER"];
export const RUN_RANKS: Rank[] = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
  joker: "★",
};

const DISPLAY_RANK_ORDER: Rank[] = ["3", "JOKER", "2", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4"];
const SUIT_ORDER: Suit[] = ["joker", "spades", "hearts", "diamonds", "clubs"];

export function isWild(card: Card) {
  return card.rank === "2" || card.rank === "JOKER";
}

export function isBadThree(card: Card) {
  return card.rank === "3";
}

export function isNaturalForMeld(card: Card) {
  return !isWild(card) && !isBadThree(card);
}

export function cardLabel(card: Card) {
  return card.rank === "JOKER" ? "Joker" : `${card.rank}${SUIT_SYMBOL[card.suit]}`;
}

export function cardPoints(card: Card) {
  if (card.rank === "JOKER" || card.rank === "2" || card.rank === "A") {
    return 20;
  }
  if (card.rank === "3") {
    return card.suit === "hearts" || card.suit === "diamonds" ? 300 : 15;
  }
  if (["J", "Q", "K", "10"].includes(card.rank)) {
    return 10;
  }
  return 5;
}

export function sortCardsForDisplay(cards: Card[]) {
  return [...cards].sort((left, right) => {
    const rankDifference = DISPLAY_RANK_ORDER.indexOf(left.rank) - DISPLAY_RANK_ORDER.indexOf(right.rank);
    if (rankDifference !== 0) {
      return rankDifference;
    }

    const suitDifference = SUIT_ORDER.indexOf(left.suit) - SUIT_ORDER.indexOf(right.suit);
    if (suitDifference !== 0) {
      return suitDifference;
    }

    return left.id.localeCompare(right.id);
  });
}

function naturalRanks(cards: Card[]) {
  return cards.filter(isNaturalForMeld).map((card) => card.rank);
}

function consecutiveRanks(cards: Card[]) {
  const naturals = cards.filter(isNaturalForMeld);
  if (!naturals.length) {
    return false;
  }
  const suit = naturals[0].suit;
  if (naturals.some((card) => card.suit !== suit || !RUN_RANKS.includes(card.rank))) {
    return false;
  }

  const positions = naturals
    .map((card) => RUN_RANKS.indexOf(card.rank))
    .sort((a, b) => a - b);

  let gaps = 0;
  for (let index = 1; index < positions.length; index += 1) {
    const diff = positions[index] - positions[index - 1];
    if (diff === 0) {
      return false;
    }
    gaps += diff - 1;
  }

  return gaps <= cards.filter(isWild).length;
}

export function detectMeldType(cards: Card[]): "set" | "run" | null {
  if (cards.length < 3 || cards.some(isBadThree)) {
    return null;
  }
  const naturals = cards.filter(isNaturalForMeld);
  if (!naturals.length) {
    return null;
  }

  const allSameRank = naturals.every((card) => card.rank === naturals[0].rank);
  if (allSameRank) {
    return "set";
  }
  if (consecutiveRanks(cards)) {
    return "run";
  }
  return null;
}

export function canCreateMeld(cards: Card[]) {
  const type = detectMeldType(cards);
  if (!type) {
    return { ok: false, reason: "Meld must be a set or same-suit run with at least 3 cards." };
  }
  const wilds = cards.filter(isWild).length;
  if (wilds > 1) {
    return { ok: false, reason: "Only one wild can be used when creating a new meld." };
  }
  if (cards.filter(isNaturalForMeld).length < 2) {
    return { ok: false, reason: "A new meld needs at least two natural cards." };
  }
  const points = cards.reduce((sum, card) => sum + cardPoints(card), 0);
  if (points < 15) {
    return { ok: false, reason: "Each new meld must be worth at least 15 points." };
  }
  return { ok: true, type, points };
}

export function canAddToMeld(meld: Meld, cards: Card[]) {
  if (!cards.length || cards.some(isBadThree)) {
    return false;
  }
  const merged = [...meld.cards, ...cards];
  if (meld.type === "set") {
    const naturals = naturalRanks(merged);
    return naturals.every((rank) => rank === naturals[0]);
  }
  return consecutiveRanks(merged);
}
