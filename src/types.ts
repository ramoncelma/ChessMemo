import type { Schedule } from "./srs";

export type Orientation = "white" | "black";

// One move within a line.
export interface LineMove {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  comment?: string;
}

// A complete line (root to leaf) — the unit of spaced repetition.
export interface Line {
  id: string;
  chapterIdx: number;
  moves: LineMove[];
  attempts: number;
  misses: number;
  sched: Schedule;
  lineTimes: number[]; // response times (ms) to complete the line
  moveTimes: Record<number, number[]>; // move index -> response times (ms)
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
  lines: Line[];
}
