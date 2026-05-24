import type { Card as FsrsCard } from "ts-fsrs";

export type Orientation = "white" | "black";

export type Category = "opening" | "tactic" | "endgame";

export const CATEGORY_LABELS: Record<Category, string> = {
  opening: "Openings",
  tactic: "Tactics",
  endgame: "Endgames",
};

// One thing to recall: the position (FEN) just before the trainee's move,
// plus the move they are expected to play.
export interface Card {
  id: string;
  fen: string;
  answerSan: string;
  answerFrom: string;
  answerTo: string;
  promotion?: string;
  line: string; // moves played so far, for context
  attempts: number;
  misses: number;
  fsrs: FsrsCard;
}

export interface Study {
  id: string;
  name: string;
  category: Category;
  orientation: Orientation;
  createdAt: number;
  cards: Card[];
}
