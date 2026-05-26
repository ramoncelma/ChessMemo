import { newSchedule } from "./srs";
import { enumerateLines, parsePgn } from "./pgnTree";
import type { Line, LineMove, Orientation } from "./types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Turn every complete line in a PGN (mainline + variations) into a spaced-
// repetition line, keeping only those that contain at least one move by the
// trainee. Deduplicates identical move sequences.
export function buildLines(
  pgn: string,
  orientation: Orientation,
  chapterIdx = 0,
): Line[] {
  const tree = parsePgn(pgn); // throws on invalid PGN
  const want = orientation === "white" ? "w" : "b";
  const paths = enumerateLines(tree);
  const lines: Line[] = [];
  const seen = new Set<string>();

  for (const path of paths) {
    if (!path.some((n) => n.color === want)) continue;
    const sig = path.map((n) => n.san).join(" ");
    if (seen.has(sig)) continue;
    seen.add(sig);
    const moves: LineMove[] = path.map((n) => ({
      san: n.san,
      from: n.from,
      to: n.to,
      promotion: n.promotion,
      color: n.color,
      fenBefore: n.fenBefore,
      fenAfter: n.fenAfter,
      comment: n.comment,
    }));
    lines.push({
      id: uuid(),
      chapterIdx,
      moves,
      attempts: 0,
      misses: 0,
      sched: newSchedule(),
      lineTimes: [],
      moveTimes: {},
    });
  }

  return lines;
}

function header(pgn: string, tag: string): string | undefined {
  const v = new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`).exec(pgn)?.[1]?.trim();
  return v && v !== "?" ? v : undefined;
}

export function studyNameFromPgn(pgn: string, fallback: string): string {
  return (
    header(pgn, "Opening") ??
    header(pgn, "StudyName") ??
    header(pgn, "Event") ??
    fallback
  );
}

export function chapterNameFromPgn(pgn: string, fallback: string): string {
  return (
    header(pgn, "ChapterName") ?? header(pgn, "Event") ?? fallback
  );
}
