import type { Schedule } from "./srs";
import type { Speed } from "./settings";

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
  paused?: boolean; // excluded from practice and SRS calendars
  weight?: number; // 0..100 within chapter, from masters frequency
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
  categories: Speed[]; // game modes this repertoire is for
  createdAt: number;
  lines: Line[];
  // Bumped whenever the weight algorithm or data source changes, so older
  // computed weights can be detected and refreshed automatically.
  weightsVersion?: number;
}
