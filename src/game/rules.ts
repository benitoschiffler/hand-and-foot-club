import type { Card, Meld, Rank, Suit } from "../types";

export const RANK_ORDER: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "JOKER"];
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
  if (["10", "J", "Q", "K"].includes(card.rank)) {
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

export function detectMeldType(cards: Card[]): "set" | null {
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
  return null;
}

export function canCreateMeld(cards: Card[], existingMelds?: Meld[]) {
  const type = detectMeldType(cards);
  if (!type) {
    return { ok: false, reason: "A basket must contain cards of the same rank (with at least 3 cards). Please select and create one basket at a time." };
  }
  if (cards.filter(isNaturalForMeld).length < 2) {
    return { ok: false, reason: "A new meld needs at least two natural cards." };
  }
  const points = cards.reduce((sum, card) => sum + cardPoints(card), 0);
  if (points < 15) {
    return { ok: false, reason: "Each new meld must be worth at least 15 points." };
  }
  
  if (existingMelds && existingMelds.length > 0) {
    const firstNatural = cards.find(c => !isWild(c));
    const isClean = !cards.some(isWild);
    if (firstNatural && existingMelds.some(m => m.rank === firstNatural.rank && (!m.cards.some(isWild) === isClean))) {
      return { ok: false, reason: `You already have a ${isClean ? "clean" : "dirty"} basket of ${firstNatural.rank}s. Add to it instead.` };
    }
  }

  return { ok: true, type, points };
}

export function canAddToMeld(meld: Meld, cards: Card[]) {
  if ((meld as { type?: string }).type !== "set" || !cards.length || cards.some(isBadThree)) {
    return false;
  }
  const merged = [...meld.cards, ...cards];
  const naturals = naturalRanks(merged);
  return naturals.length >= 2 && naturals.every((rank) => rank === naturals[0]);
}

export function findUniqueAddTarget(melds: Meld[], cards: Card[]) {
  const compatible = melds.filter((meld) => canAddToMeld(meld, cards));
  return compatible.length === 1 ? compatible[0].id : null;
}
