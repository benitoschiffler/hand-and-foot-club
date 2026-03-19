import type { Card, Difficulty, GameState, Meld, PlayerState } from "../types";
import { canAddToMeld, canCreateMeld, cardLabel, cardPoints, detectMeldType, isBadThree, isWild, sortCardsForDisplay } from "./rules";

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function buildDeck(deckCount: number) {
  const cards: Card[] = [];
  for (let deck = 1; deck <= deckCount; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank, deck });
      }
    }
    cards.push({ id: `${deck}-joker-a`, suit: "joker", rank: "JOKER", deck });
    cards.push({ id: `${deck}-joker-b`, suit: "joker", rank: "JOKER", deck });
  }
  return shuffle(cards);
}

function createPlayer(name: string, index: number, cpuDifficulty?: Difficulty): PlayerState {
  return {
    id: `P${index + 1}`,
    name,
    isCpu: Boolean(cpuDifficulty),
    difficulty: cpuDifficulty,
    chosenHand: false,
    hand: [],
    foot: [],
    footRevealed: false,
    hasGoneDown: false,
    melds: [],
    score: 0,
  };
}

function scoreStartingPile(cards: Card[]) {
  const badThreePenalty = cards.filter(isBadThree).reduce((sum, card) => sum + cardPoints(card), 0);
  const wildBonus = cards.filter(isWild).length * 8;
  const naturalGroups = rankBucket(cards.filter((card) => !isBadThree(card) && !isWild(card)))
    .slice(0, 2)
    .reduce((sum, group) => sum + group.length * group.length, 0);

  return naturalGroups + wildBonus - badThreePenalty;
}

function autoChooseStartingHand(player: PlayerState) {
  if (!player.handChoice) {
    return player;
  }
  const [optionA, optionB] = player.handChoice.options;
  const optionIndex: 0 | 1 = scoreStartingPile(optionA) >= scoreStartingPile(optionB) ? 0 : 1;

  return {
    ...player,
    chosenHand: true,
    hand: sortCardsForDisplay(player.handChoice.options[optionIndex]),
    foot: sortCardsForDisplay(player.handChoice.options[optionIndex === 0 ? 1 : 0]),
    handChoice: undefined,
  };
}

export function createGame(mode: "cpu" | "online", deckCount: number, players: Array<{ name: string; difficulty?: Difficulty }>, roomCode?: string): GameState {
  let stock = buildDeck(deckCount);
  const roster = players.map((player, index) => createPlayer(player.name, index, player.difficulty));

  const dealt = roster.map((player) => {
    const choiceA = stock.splice(0, 7);
    const choiceB = stock.splice(0, 7);
    const dealtPlayer: PlayerState = {
      ...player,
      handChoice: { options: [choiceA, choiceB] as [Card[], Card[]] },
    };
    return dealtPlayer.isCpu ? autoChooseStartingHand(dealtPlayer) : dealtPlayer;
  });

  return {
    id: crypto.randomUUID(),
    mode,
    roomCode,
    deckCount,
    players: dealt,
    stock,
    discard: [],
    currentPlayer: 0,
    started: true,
    turn: {
      drawn: false,
      source: null,
      pickedDiscard: false,
      playedThisTurn: [],
    },
    lastAction: "Game created",
  };
}

export function chooseStartingHand(state: GameState, playerId: string, optionIndex: 0 | 1) {
  return mutate(state, (draft) => {
    const player = draft.players.find((entry) => entry.id === playerId);
    if (!player?.handChoice) {
      return;
    }
    player.hand = sortCardsForDisplay(player.handChoice.options[optionIndex]);
    player.foot = sortCardsForDisplay(player.handChoice.options[optionIndex === 0 ? 1 : 0]);
    player.chosenHand = true;
    delete player.handChoice;
    draft.lastAction = `${player.name} chose a starting hand`;
  });
}

function activeCards(player: PlayerState) {
  return player.hand.length ? player.hand : player.foot;
}

function setActiveCards(player: PlayerState, cards: Card[]) {
  if (player.hand.length) {
    player.hand = sortCardsForDisplay(cards);
    return;
  }
  player.foot = sortCardsForDisplay(cards);
}

function resetTurn(state: GameState) {
  state.turn = {
    drawn: false,
    source: null,
    pickedDiscard: false,
    playedThisTurn: [],
  };
}

function nextPlayerIndex(state: GameState) {
  return (state.currentPlayer + 1) % state.players.length;
}

function maybeRevealFoot(player: PlayerState) {
  if (!player.hand.length && player.foot.length) {
    player.footRevealed = true;
  }
}

export function drawFromStock(state: GameState) {
  return mutate(state, (draft) => {
    const player = draft.players[draft.currentPlayer];
    if (!player.chosenHand || draft.turn.drawn || draft.stock.length < 2) {
      return;
    }
    const destination = activeCards(player);
    destination.push(...draft.stock.splice(0, 2));
    setActiveCards(player, destination);
    draft.turn.drawn = true;
    draft.turn.source = "stock";
    draft.lastAction = `${player.name} drew 2 cards`;
  });
}

export function pickUpDiscard(state: GameState) {
  return mutate(state, (draft) => {
    const player = draft.players[draft.currentPlayer];
    if (!player.chosenHand || draft.turn.drawn || !draft.discard.length) {
      return;
    }
    const originalDiscardCount = draft.discard.length;
    const destination = activeCards(player);
    destination.push(...draft.discard.splice(0));
    if (originalDiscardCount === 1 && draft.stock.length) {
      destination.push(...draft.stock.splice(0, 1));
    }
    setActiveCards(player, destination);
    draft.turn.drawn = true;
    draft.turn.source = "discard";
    draft.turn.pickedDiscard = true;
    draft.lastAction = `${player.name} picked up the discard pile`;
  });
}

export function createMeld(state: GameState, playerId: string, cardIds: string[]) {
  return mutate(state, (draft) => {
    const player = draft.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    const cards = takeCards(player, cardIds);
    if (!cards.length) {
      return;
    }
    const verdict = canCreateMeld(cards);
    if (!verdict.ok) {
      restoreCards(player, cards);
      draft.lastAction = (verdict as { reason?: string }).reason ?? "Invalid meld.";
      return;
    }
    const type = detectMeldType(cards)!;
    const firstNatural = cards.find((card) => !isWild(card))!;
    const meld: Meld = {
      id: crypto.randomUUID(),
      type,
      cards,
      rank: type === "set" ? firstNatural.rank : undefined,
      suit: type === "run" && firstNatural.suit !== "joker" ? firstNatural.suit : undefined,
    };
    player.melds.push(meld);
    draft.turn.playedThisTurn.push(...cards);
    if (!player.hasGoneDown && turnPoints(draft) >= 90) {
      player.hasGoneDown = true;
    }
    maybeRevealFoot(player);
    draft.lastAction = `${player.name} created a ${type} meld`;
  });
}

export function addToMeld(state: GameState, playerId: string, meldId: string, cardIds: string[]) {
  return mutate(state, (draft) => {
    const player = draft.players.find((entry) => entry.id === playerId);
    if (!player) {
      return;
    }
    const meld = player.melds.find((entry) => entry.id === meldId);
    if (!meld) {
      return;
    }
    const cards = takeCards(player, cardIds);
    if (!cards.length) {
      return;
    }
    if (!canAddToMeld(meld, cards)) {
      restoreCards(player, cards);
      draft.lastAction = "Those cards do not fit that meld.";
      return;
    }
    meld.cards.push(...cards);
    meld.cards = sortCardsForDisplay(meld.cards);
    draft.turn.playedThisTurn.push(...cards);
    maybeRevealFoot(player);
    draft.lastAction = `${player.name} added to a meld`;
  });
}

export function discardCard(state: GameState, playerId: string, cardId: string) {
  return mutate(state, (draft) => {
    const player = draft.players.find((entry) => entry.id === playerId);
    if (!player || !draft.turn.drawn) {
      return;
    }
    if (!player.hasGoneDown && draft.turn.playedThisTurn.length > 0 && turnPoints(draft) < 90) {
      draft.lastAction = "You cannot end the turn until your first melds total 90 points.";
      return;
    }
    const cards = activeCards(player);
    const index = cards.findIndex((card) => card.id === cardId);
    if (index === -1) {
      return;
    }
    const [card] = cards.splice(index, 1);
    setActiveCards(player, cards);
    draft.discard.unshift(card);
    if (!player.hand.length && player.foot.length && !player.footRevealed) {
      player.footRevealed = true;
      draft.lastAction = `${player.name} moved into the foot`;
    } else {
      draft.lastAction = `${player.name} discarded ${cardLabel(card)}`;
    }
    if (!player.hand.length && !player.foot.length) {
      player.score = 0;
      draft.winnerId = player.id;
      draft.lastAction = `${player.name} went out`;
      finishGame(draft, player.id);
      return;
    }
    draft.currentPlayer = nextPlayerIndex(draft);
    resetTurn(draft);
  });
}

function finishGame(state: GameState, winnerId: string) {
  state.players = state.players.map((player) => ({
    ...player,
    score:
      player.id === winnerId
        ? 0
        : [...player.hand, ...player.foot].reduce((sum, card) => sum + cardPoints(card), 0),
  }));
}

function turnPoints(state: GameState) {
  return state.turn.playedThisTurn.reduce((sum, card) => sum + cardPoints(card), 0);
}

function takeCards(player: PlayerState, cardIds: string[]) {
  const cards = activeCards(player);
  const removed: Card[] = [];
  for (const id of cardIds) {
    const index = cards.findIndex((card) => card.id === id);
    if (index !== -1) {
      removed.push(cards.splice(index, 1)[0]);
    }
  }
  setActiveCards(player, cards);
  return removed;
}

function restoreCards(player: PlayerState, cards: Card[]) {
  const active = activeCards(player);
  active.push(...cards);
  setActiveCards(player, active);
}

function mutate(state: GameState, fn: (draft: GameState) => void) {
  const draft = structuredClone(state);
  fn(draft);
  return draft;
}

function rankBucket(cards: Card[]) {
  const buckets = new Map<string, Card[]>();
  for (const card of cards) {
    const key = `${card.rank}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(card);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.length - a.length);
}

function suitRuns(cards: Card[]) {
  const natural = cards.filter((card) => !isBadThree(card) && !isWild(card) && card.suit !== "joker");
  const bySuit = new Map<string, Card[]>();
  for (const card of natural) {
    const bucket = bySuit.get(card.suit) ?? [];
    bucket.push(card);
    bySuit.set(card.suit, bucket);
  }
  return [...bySuit.values()].filter((cardsInSuit) => cardsInSuit.length >= 3);
}

function chooseDiscardForDifficulty(cards: Card[], difficulty: Difficulty) {
  const sorted = [...cards].sort((a, b) => cardPoints(a) - cardPoints(b));
  if (difficulty === "easy") {
    return sorted[Math.floor(Math.random() * sorted.length)];
  }
  if (difficulty === "medium") {
    return sorted.find((card) => !isWild(card) && !isBadThree(card)) ?? sorted[0];
  }
  return [...sorted].reverse().find((card) => isBadThree(card)) ?? sorted.find((card) => !isWild(card)) ?? sorted[0];
}

function opponentMeldSets(state: GameState, playerId: string) {
  return state.players
    .filter((p) => p.id !== playerId)
    .flatMap((p) => p.melds.filter((m) => m.type === "set" && m.rank).map((m) => m.rank!));
}

function opponentMeldRuns(state: GameState, playerId: string) {
  return state.players
    .filter((p) => p.id !== playerId)
    .flatMap((p) => p.melds.filter((m) => m.type === "run" && m.suit).map((m) => m.suit!));
}

function chooseDiscardAware(cards: Card[], difficulty: Difficulty, opponentRanks: string[], opponentSuits: string[]) {
  const sorted = [...cards].sort((a, b) => cardPoints(a) - cardPoints(b));
  // Hard: prefer discarding cards that don't match opponent melds
  const safeDiscard = sorted.find(
    (card) => !isWild(card) && !isBadThree(card) && !opponentRanks.includes(card.rank) && !opponentSuits.includes(card.suit),
  );
  return safeDiscard ?? chooseDiscardForDifficulty(cards, difficulty);
}

export function runCpuTurn(state: GameState) {
  const player = state.players[state.currentPlayer];
  if (!player.isCpu || state.winnerId) {
    return state;
  }

  let draft = state;
  if (!player.chosenHand) {
    draft = mutate(draft, (mutable) => {
      mutable.players[mutable.currentPlayer] = autoChooseStartingHand(mutable.players[mutable.currentPlayer]);
      mutable.lastAction = `${mutable.players[mutable.currentPlayer].name} chose a starting hand`;
    });
  }

  const difficulty = player.difficulty ?? "easy";

  // Medium/hard: pick up the discard pile if the top card fits an existing meld
  const topDiscard = draft.discard[0];
  const currentMelds = draft.players[draft.currentPlayer].melds;
  const discardFitsExistingMeld = topDiscard && currentMelds.some((meld) => canAddToMeld(meld, [topDiscard]));
  if (difficulty !== "easy" && discardFitsExistingMeld) {
    const attempt = pickUpDiscard(draft);
    draft = attempt.turn.drawn ? attempt : drawFromStock(draft);
  } else {
    draft = drawFromStock(draft);
  }

  // Try to create new melds
  const active = activeCards(draft.players[draft.currentPlayer]);
  const sets = rankBucket(active).filter((bucket) => bucket.length >= 3);
  const candidateSet = sets.find((bucket) => canCreateMeld(bucket.slice(0, 3)).ok);
  if (candidateSet) {
    draft = createMeld(draft, player.id, candidateSet.slice(0, Math.min(candidateSet.length, 4)).map((card) => card.id));
  } else {
    const runs = suitRuns(active);
    const run = runs.find((bucket) => canCreateMeld(bucket.slice(0, 3)).ok);
    if (run) {
      draft = createMeld(draft, player.id, run.slice(0, 3).map((card) => card.id));
    }
  }

  // Medium/hard: add to existing melds, but only once down to avoid getting stuck on the 90-point rule
  if (difficulty !== "easy" && draft.players[draft.currentPlayer].hasGoneDown) {
    for (const meld of draft.players[draft.currentPlayer].melds) {
      const currentCards = activeCards(draft.players[draft.currentPlayer]);
      const addable = currentCards.filter((card) => canAddToMeld(meld, [card]));
      if (addable.length) {
        draft = addToMeld(draft, player.id, meld.id, [addable[0].id]);
      }
    }
  }

  const latestCards = activeCards(draft.players[draft.currentPlayer]);
  const discard =
    difficulty === "hard"
      ? chooseDiscardAware(latestCards, difficulty, opponentMeldSets(draft, player.id), opponentMeldRuns(draft, player.id))
      : chooseDiscardForDifficulty(latestCards, difficulty);
  return discard ? discardCard(draft, player.id, discard.id) : draft;
}
