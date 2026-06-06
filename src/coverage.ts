import type { Study } from "./types";

// Cumulative coverage of a slice of lines as a percentage. Lines whose weight
// is undefined (never computed) and paused lines are excluded. Since each
// line's weight is the joint probability of the opponent moves along it, and
// every line in a chapter starts from the same position, summing across
// distinct lines covers the disjoint branches of the opponent tree — which
// is exactly the "fraction of master games this chapter would handle".
//
// User moves are forced in a repertoire (probability 1 by construction), so
// they don't enter the math: a chapter that exhaustively covers every
// opponent reply tops out at 100% regardless of how many of your own moves
// branch where.
export function chapterCoverage(study: Study, chapterIdx: number): number {
  let sum = 0;
  for (const l of study.lines) {
    if (l.chapterIdx !== chapterIdx) continue;
    if (l.paused) continue;
    if (l.weight === undefined) continue;
    sum += l.weight;
  }
  return sum;
}

export function studyCoverage(study: Study): number {
  let sum = 0;
  for (const l of study.lines) {
    if (l.paused) continue;
    if (l.weight === undefined) continue;
    sum += l.weight;
  }
  return sum;
}

export function formatCoverage(pct: number): string {
  if (pct === 0) return "no data";
  if (pct >= 100) return ">=100%";
  if (pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}

export function formatOneIn(pct: number): string | null {
  if (pct <= 0) return null;
  const n = Math.max(1, Math.round(100 / pct));
  return `1 in ${n}`;
}
