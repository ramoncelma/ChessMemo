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

// Win/draw/black-wins totals at a single position. Stored on each line for
// the leaf position so the line list can display "W36 D37 B27" alongside
// the encounter probability.
export interface Wdb {
  w: number;
  d: number;
  b: number;
  total: number;
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
  weight?: number; // 0..100 — GM (Masters explorer) encounter probability
  weightLichess?: number; // 0..100 — Lichess online encounter probability
  gmWdb?: Wdb; // GM W/D/B at the leaf position
  lichessWdb?: Wdb; // Lichess W/D/B at the leaf position
  // Stockfish (Lichess Cloud Eval) score for the leaf position. Either cp
  // OR mate is set when known; both undefined while pending. evalNotCached
  // sticks when Lichess returns no entry — clear it (or hit "Refresh evals")
  // to make the scheduler retry that line's leaf.
  evalCp?: number;
  evalMate?: number;
  evalDepth?: number;
  evalNotCached?: boolean;
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
  // Signature of the Lichess explorer filters under which the current
  // weightLichess / lichessWdb values were computed. Triggers a recompute
  // when the user's filter selection changes.
  lichessFiltersSignature?: string;
}
