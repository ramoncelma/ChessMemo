import { cardLevel, isDue, LEVEL_NAMES, RETAINED_LEVEL } from "./srs";
import type { ReviewEntry } from "./storage";
import type { Card, Study } from "./types";

export interface Retention {
  levels: number[]; // count of cards per level
  retainedPct: number; // 0..100
  total: number;
}

export function retention(cards: Card[]): Retention {
  const levels = new Array(LEVEL_NAMES.length).fill(0);
  let retained = 0;
  for (const c of cards) {
    const lvl = cardLevel(c.fsrs);
    levels[lvl]++;
    if (lvl >= RETAINED_LEVEL) retained++;
  }
  const total = cards.length;
  return {
    levels,
    total,
    retainedPct: total === 0 ? 0 : Math.round((retained / total) * 100),
  };
}

export function dueCount(studies: Study[], now = new Date()): number {
  let n = 0;
  for (const s of studies) for (const c of s.cards) if (isDue(c.fsrs, now)) n++;
  return n;
}

// Soonest future review time across all not-yet-due cards.
export function nextReviewAt(studies: Study[], now = new Date()): Date | null {
  let soonest: number | null = null;
  for (const s of studies) {
    for (const c of s.cards) {
      const due = new Date(c.fsrs.due).getTime();
      if (due > now.getTime() && (soonest === null || due < soonest)) {
        soonest = due;
      }
    }
  }
  return soonest === null ? null : new Date(soonest);
}

export function formatCountdown(target: Date, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

export function accuracy(cards: Card[]): number | null {
  let attempts = 0;
  let misses = 0;
  for (const c of cards) {
    attempts += c.attempts;
    misses += c.misses;
  }
  if (attempts === 0) return null;
  return Math.round(((attempts - misses) / attempts) * 100);
}

export interface WeakSpot {
  studyName: string;
  card: Card;
  rate: number; // miss rate 0..1
}

export function weakSpots(studies: Study[], limit = 6): WeakSpot[] {
  const spots: WeakSpot[] = [];
  for (const s of studies) {
    for (const c of s.cards) {
      if (c.attempts >= 2 && c.misses > 0) {
        spots.push({ studyName: s.name, card: c, rate: c.misses / c.attempts });
      }
    }
  }
  spots.sort((a, b) => b.rate - a.rate || b.card.misses - a.card.misses);
  return spots.slice(0, limit);
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function currentStreak(log: ReviewEntry[], now = new Date()): number {
  if (log.length === 0) return 0;
  const days = new Set(log.map((e) => dayKey(e.ts)));
  let streak = 0;
  const cursor = new Date(now);
  // If nothing today, the streak can still be alive from yesterday.
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface DayActivity {
  label: string;
  count: number;
}

// Reviews per day for the last `days` days, oldest first.
export function activity(log: ReviewEntry[], days = 7, now = new Date()): DayActivity[] {
  const counts = new Map<string, number>();
  for (const e of log) counts.set(dayKey(e.ts), (counts.get(dayKey(e.ts)) ?? 0) + 1);
  const out: DayActivity[] = [];
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push({ label: labels[d.getDay()], count: counts.get(dayKey(d.getTime())) ?? 0 });
  }
  return out;
}

export function totalReviews(log: ReviewEntry[]): number {
  return log.length;
}

export interface ForecastDay {
  label: string;
  date: number;
  count: number;
  today: boolean;
}

// How many positions come due on each of the next `days` days (overdue and
// due-today both fall on day 0). Gives a schematic "when to come back" view.
export function forecast(studies: Study[], days = 14, now = new Date()): ForecastDay[] {
  const dayMs = 86400000;
  const todayMid = new Date(now);
  todayMid.setHours(0, 0, 0, 0);
  const base = todayMid.getTime();
  const buckets = new Array(days).fill(0);

  for (const s of studies) {
    for (const c of s.cards) {
      const dm = new Date(c.fsrs.due);
      dm.setHours(0, 0, 0, 0);
      let idx = Math.round((dm.getTime() - base) / dayMs);
      if (idx < 0) idx = 0;
      if (idx < days) buckets[idx]++;
    }
  }

  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return buckets.map((count, i) => {
    const d = new Date(base + i * dayMs);
    return {
      label: i === 0 ? "Today" : labels[d.getDay()],
      date: d.getDate(),
      count,
      today: i === 0,
    };
  });
}
