import { get, set } from "idb-keyval";
import { buildLines } from "./pgn";
import type { Chapter, Line, Study } from "./types";

const STUDIES_KEY = "chessmemo.studies";
const LOG_KEY = "chessmemo.reviewlog";

// Normalize studies loaded from older versions. The spaced-repetition unit is
// now the line; older data stored per-position cards, so rebuild lines from the
// chapter PGNs (progress on the old cards can't be carried over).
function normalize(studies: Study[]): Study[] {
  return studies.map((s) => {
    const legacyPgn = (s as { pgn?: string }).pgn;
    const chapters: Chapter[] =
      s.chapters ?? (legacyPgn ? [{ name: "Chapter 1", pgn: legacyPgn }] : []);

    let lines: Line[] = s.lines ?? [];
    if (!s.lines) {
      lines = [];
      chapters.forEach((ch, i) => {
        try {
          lines.push(...buildLines(ch.pgn, s.orientation, i));
        } catch {
          // skip unparseable chapter
        }
      });
    }

    return { ...s, chapters, lines };
  });
}

export async function loadStudies(): Promise<Study[]> {
  const raw = (await get<Study[]>(STUDIES_KEY)) ?? [];
  return normalize(raw);
}

export async function saveStudies(studies: Study[]): Promise<void> {
  await set(STUDIES_KEY, studies);
}

export interface ReviewEntry {
  ts: number;
  correct: boolean;
}

export async function loadReviewLog(): Promise<ReviewEntry[]> {
  return (await get<ReviewEntry[]>(LOG_KEY)) ?? [];
}

export async function appendReview(correct: boolean): Promise<void> {
  const log = await loadReviewLog();
  log.push({ ts: Date.now(), correct });
  await set(LOG_KEY, log);
}
