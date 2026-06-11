// Memorization scheduling.
// Two methods are supported, chosen by settings.memorizationMethod:
//   - "sr"   — custom fixed-interval levels (the original system). Lines
//              promote one level on a clean pass and reset to level 1 on a
//              miss. Level intervals and names are user-editable.
//   - "fsrs" — delegates to ts-fsrs. Each line carries an FSRS card state
//              that the algorithm advances on each grade. The `level`
//              field is still maintained for UI parity (level distribution,
//              the "L3" badge) by mapping the next scheduled interval to
//              the closest custom SR level.

import { fsrs as makeFsrs, createEmptyCard, Rating, type Card } from "ts-fsrs";
import { nowSrs } from "./clock";
import { DEFAULT_SRS_LEVELS, type SrsLevelConfig } from "./settings";

const HOUR = 3600_000;
const SETTINGS_KEY = "chessmemo.settings";

// ---------------------------------------------------------------------------
// Settings access
// ---------------------------------------------------------------------------

function readSettings(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getCurrentSrsLevels(): SrsLevelConfig[] {
  const s = readSettings();
  const v = s.srsLevels;
  if (Array.isArray(v) && v.length >= 2) return v as SrsLevelConfig[];
  return DEFAULT_SRS_LEVELS;
}

export function getMemorizationMethod(): "sr" | "fsrs" {
  const s = readSettings();
  return s.memorizationMethod === "fsrs" ? "fsrs" : "sr";
}

// Back-compat re-exports — callers that used to import the constants
// directly continue to work; they now read live settings.
export const LEVEL_INTERVALS_MS = new Proxy([] as number[], {
  get(_t, p) {
    if (p === "length") return getCurrentSrsLevels().length;
    if (typeof p === "string" && /^\d+$/.test(p)) {
      return getCurrentSrsLevels()[Number(p)]?.intervalMs ?? 0;
    }
    return Reflect.get(getCurrentSrsLevels().map((l) => l.intervalMs), p);
  },
}) as unknown as readonly number[];

export const LEVEL_NAMES = new Proxy([] as string[], {
  get(_t, p) {
    if (p === "length") return getCurrentSrsLevels().length;
    if (typeof p === "string" && /^\d+$/.test(p)) {
      return getCurrentSrsLevels()[Number(p)]?.name ?? "";
    }
    return Reflect.get(getCurrentSrsLevels().map((l) => l.name), p);
  },
}) as unknown as readonly string[];

function maxLevel(): number {
  return getCurrentSrsLevels().length - 1;
}
export const MAX_LEVEL = new Proxy(
  { v: 0 },
  { get: () => maxLevel() },
) as unknown as number;

// "retained" = scheduled at least a month out. Derived from the user's
// level config rather than hardcoded.
function retainedLevel(): number {
  const levels = getCurrentSrsLevels();
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].intervalMs >= 30 * 24 * HOUR) return i;
  }
  // Fall back to the second-half levels if nothing crosses a month.
  return Math.max(1, Math.floor(levels.length / 2));
}
export const RETAINED_LEVEL = new Proxy(
  { v: 0 },
  { get: () => retainedLevel() },
) as unknown as number;

export const RESPONSE_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Schedule type
// ---------------------------------------------------------------------------

// FSRS card state we persist on every Line when the FSRS method is active.
// The ts-fsrs Card uses Date objects on the wire; we store them as ISO
// strings to keep JSON round-trips lossless.
export interface FsrsCardState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string;
}

export interface Schedule {
  level: number;
  due: number;
  lastReview?: number;
  fsrs?: FsrsCardState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function intervalForLevel(level: number): number {
  const levels = getCurrentSrsLevels();
  const clamped = Math.max(0, Math.min(level, levels.length - 1));
  return levels[clamped].intervalMs;
}

// Map an arbitrary interval (ms) to the SR display level whose configured
// interval is closest. Used in FSRS mode so the existing level badges /
// stats keep working even though FSRS itself doesn't have discrete levels.
function levelForInterval(intervalMs: number): number {
  const levels = getCurrentSrsLevels();
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(levels[i].intervalMs - intervalMs);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

function cardFromState(s: FsrsCardState): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as Card;
}

function stateFromCard(c: Card): FsrsCardState {
  return {
    due: (c.due as Date).toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as number,
    last_review: c.last_review ? (c.last_review as Date).toISOString() : undefined,
  };
}

// Singleton FSRS scheduler. ts-fsrs has no per-call state worth caching but
// instantiating it for every grade is wasteful.
const fsrsInst = makeFsrs();

function fsrsGrade(
  s: Schedule,
  kind: Grade,
  now: number,
): Schedule {
  const card = s.fsrs ? cardFromState(s.fsrs) : createEmptyCard(new Date(now));
  const rating =
    kind === "again"
      ? Rating.Again
      : kind === "hard"
        ? Rating.Hard
        : kind === "good"
          ? Rating.Good
          : Rating.Easy;
  const result = fsrsInst.next(card, new Date(now), rating);
  const nextCard = result.card;
  const dueMs = (nextCard.due as Date).getTime();
  return {
    level: levelForInterval(dueMs - now),
    due: dueMs,
    lastReview: now,
    fsrs: stateFromCard(nextCard),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function newSchedule(now = Date.now()): Schedule {
  return { level: 0, due: now };
}

export function isDue(s: Schedule, now: number = nowSrs()): boolean {
  return s.due <= now;
}

export function promote(s: Schedule, now = Date.now()): Schedule {
  if (getMemorizationMethod() === "fsrs") return fsrsGrade(s, "good", now);
  const level = Math.min(s.level + 1, maxLevel());
  return { level, due: now + intervalForLevel(level), lastReview: now };
}

export function resetLevel(now = Date.now()): Schedule {
  if (getMemorizationMethod() === "fsrs")
    return fsrsGrade({ level: 0, due: now }, "again", now);
  return { level: 1, due: now + intervalForLevel(1), lastReview: now };
}

export type Grade = "again" | "hard" | "good" | "easy";

export function grade(s: Schedule, kind: Grade, now = Date.now()): Schedule {
  if (getMemorizationMethod() === "fsrs") return fsrsGrade(s, kind, now);
  switch (kind) {
    case "again":
      return resetLevel(now);
    case "good":
      return promote(s, now);
    case "easy":
      return promote(promote(s, now), now);
    case "hard": {
      const lvl = Math.max(1, s.level);
      const half = Math.max(HOUR, Math.floor(intervalForLevel(lvl) / 2));
      return { level: lvl, due: now + half, lastReview: now };
    }
  }
}
