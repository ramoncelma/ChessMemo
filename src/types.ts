import type { Card as FsrsCard } from "ts-fsrs";

export type Orientation = "white" | "black";

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
  chapterIdx: number;
  attempts: number;
  misses: number;
  fsrs: FsrsCard;
}

// A single PGN added to an opening. An opening can hold several.
export interface Chapter {
  name: string;
  pgn: string;
}

export interface Study {
  id: string;
  name: string;
  orientation: Orientation;
  chapters: Chapter[];
  createdAt: number;
  cards: Card[];
}
