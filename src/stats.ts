import { isDue, LEVEL_NAMES, RETAINED_LEVEL } from "./srs";
import type { ReviewEntry } from "./storage";
import type { Line, Study } from "./types";

export interface Retention {
  levels: number[]; // count of lines per level
  retainedPct: number; // 0..100
  total: number;
}

export function retention(lines: Line[]): Retention {
  const levels = new Array(LEVEL_NAMES.length).fill(0);
  let retained = 0;
  for (const l of lines) {
    const lvl = l.sched.level;
    levels[lvl]++;
    if (lvl >= RETAINED_LEVEL) retained++;
  }
  const total = lines.length;
  return {
    levels,
    total,
    retainedPct: total === 0 ? 0 : Math.round((retained / total) * 100),
  };
}

export interface TimeSummary {
  n: number;
  avg: number;
  min: number;
  max: number;
}

export function summarizeTimes(times: number[]): TimeSummary | null {
  if (times.length === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const t of times) {
    sum += t;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { n: times.length, avg: Math.round(sum / times.length), min, max };
}

export function dueCount(studies: Study[], now = Date.now()): number {
  let n = 0;
  for (const s of studies) for (const l of s.lines) if (isDue(l.sched, now)) n++;
  return n;
}

export function nextReviewAt(studies: Study[], now = Date.now()): Date | null {
  let soonest: number | null = null;
  for (const s of studies) {
    for (const l of s.lines) {
      const due = l.sched.due;
      if (due > now && (soonest === null || due < soonest)) soonest = due;
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

export function accuracy(lines: Line[]): number | null {
  let attempts = 0;
  let misses = 0;
  for (const l of lines) {
    attempts += l.attempts;
    misses += l.misses;
  }
  if (attempts === 0) return null;
  return Math.round(((attempts - misses) / attempts) * 100);
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
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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

export interface DueLineRef {
  studyId: string;
  studyName: string;
  line: Line;
}

// The lines that fall on a given forecast day (overdue counts as day 0).
export function linesDueOnDay(
  studies: Study[],
  dayIndex: number,
  now = Date.now(),
): DueLineRef[] {
  const dayMs = 86400000;
  const todayMid = new Date(now);
  todayMid.setHours(0, 0, 0, 0);
  const base = todayMid.getTime();
  const out: DueLineRef[] = [];
  for (const s of studies) {
    for (const l of s.lines) {
      const dm = new Date(l.sched.due);
      dm.setHours(0, 0, 0, 0);
      let idx = Math.round((dm.getTime() - base) / dayMs);
      if (idx < 0) idx = 0;
      if (idx === dayIndex) out.push({ studyId: s.id, studyName: s.name, line: l });
    }
  }
  return out;
}

// How many lines come due on each of the next `days` days.
export function forecast(studies: Study[], days = 14, now = new Date()): ForecastDay[] {
  const dayMs = 86400000;
  const todayMid = new Date(now);
  todayMid.setHours(0, 0, 0, 0);
  const base = todayMid.getTime();
  const buckets = new Array(days).fill(0);

  for (const s of studies) {
    for (const l of s.lines) {
      const dm = new Date(l.sched.due);
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
