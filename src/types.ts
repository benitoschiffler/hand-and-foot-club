export type Suit = "clubs" | "diamonds" | "hearts" | "spades" | "joker";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A"
  | "JOKER";

export type Difficulty = "easy" | "medium" | "hard";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  deck: number;
}

export interface Meld {
  id: string;
  type: "set" | "run";
  cards: Card[];
  rank?: Rank;
  suit?: Exclude<Suit, "joker">;
}

export interface PendingChoice {
  options: [Card[], Card[]];
}

export interface PlayerState {
  id: string;
  name: string;
  isCpu: boolean;
  difficulty?: Difficulty;
  chosenHand: boolean;
  handChoice?: PendingChoice;
  hand: Card[];
  foot: Card[];
  footRevealed: boolean;
  hasGoneDown: boolean;
  melds: Meld[];
  score: number;
}

export interface TurnState {
  drawn: boolean;
  source: "stock" | "discard" | null;
  pickedDiscard: boolean;
  playedThisTurn: Card[];
}

export interface GameState {
  id: string;
  mode: "cpu" | "online";
  roomCode?: string;
  deckCount: number;
  players: PlayerState[];
  stock: Card[];
  discard: Card[];
  currentPlayer: number;
  started: boolean;
  turn: TurnState;
  winnerId?: string;
  lastAction: string;
}
