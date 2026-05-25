import { get, set } from "idb-keyval";
import type { Study } from "./types";

const STUDIES_KEY = "chessmemo.studies";
const LOG_KEY = "chessmemo.reviewlog";

// Normalize studies loaded from older versions that lacked some fields.
function normalize(studies: Study[]): Study[] {
  return studies.map((s) => ({
    ...s,
    pgn: s.pgn ?? "",
    cards: s.cards.map((c) => ({
      ...c,
      attempts: c.attempts ?? 0,
      misses: c.misses ?? 0,
    })),
  }));
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
