// Custom fixed-interval spaced repetition. The unit is a whole line. A clean
// pass promotes the line one level (longer interval); a miss (wrong move, hint,
// or a response slower than the timeout) sends it back to level 1.

const HOUR = 3600_000;
const DAY = 24 * HOUR;

// Index = level. Level 0 = brand new (due immediately).
export const LEVEL_INTERVALS_MS = [
  0, // 0 New
  8 * HOUR, // 1
  2 * DAY, // 2
  5 * DAY, // 3
  14 * DAY, // 4
  30 * DAY, // 5
  60 * DAY, // 6
  90 * DAY, // 7
  180 * DAY, // 8
];

export const LEVEL_NAMES = [
  "New",
  "8 hours",
  "2 days",
  "5 days",
  "2 weeks",
  "1 month",
  "2 months",
  "3 months",
  "6 months",
];

export const MAX_LEVEL = 8;
export const RETAINED_LEVEL = 5; // "retained" = scheduled a month or more out
export const RESPONSE_TIMEOUT_MS = 30_000;

export interface Schedule {
  level: number;
  due: number; // timestamp
  lastReview?: number;
}

export function newSchedule(now = Date.now()): Schedule {
  return { level: 0, due: now };
}

export function isDue(s: Schedule, now = Date.now()): boolean {
  return s.due <= now;
}

export function promote(s: Schedule, now = Date.now()): Schedule {
  const level = Math.min(s.level + 1, MAX_LEVEL);
  return { level, due: now + LEVEL_INTERVALS_MS[level], lastReview: now };
}

export function resetLevel(now = Date.now()): Schedule {
  return { level: 1, due: now + LEVEL_INTERVALS_MS[1], lastReview: now };
}
