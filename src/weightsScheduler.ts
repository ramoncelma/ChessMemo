import { computeStudyWeights } from "./weights";
import type { Study } from "./types";

type Apply = (
  studyId: string,
  weights: Map<string, number>,
  completed: boolean,
) => void;

export interface WeightStatus {
  running: boolean;
  done: number;
  total: number;
}

const debounce = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
const queued = new Map<string, Study>();
const status = new Map<string, WeightStatus>();
const listeners = new Set<() => void>();
// One run per study per page load. If a run finishes partial (Lichess
// rate-limit, transient failure) we save what we got and wait for the next
// mount to retry the FENs that failed — instead of looping in-session and
// re-hammering the API.
const ranThisSession = new Set<string>();

export function subscribeWeightStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getWeightStatus(studyId: string): WeightStatus | null {
  return status.get(studyId) ?? null;
}

function notify() {
  for (const fn of listeners) fn();
}

function setStatus(studyId: string, s: WeightStatus | null) {
  if (s === null) status.delete(studyId);
  else status.set(studyId, s);
  notify();
}

// Schedule a background recompute for the given study. Multiple rapid calls
// (e.g. several edits in a row) collapse into one run thanks to the debounce.
// If a recompute is already running for this study, the latest snapshot is
// queued and processed once the current run completes.
export function scheduleWeightCompute(study: Study, apply: Apply) {
  // Allow a re-run if there are new lines without weights yet (e.g. the user
  // just added a chapter); otherwise honour the one-per-session lock.
  const hasMissing = study.lines.some((l) => l.weight === undefined);
  if (!hasMissing && ranThisSession.has(study.id)) return;
  ranThisSession.add(study.id);

  const existing = debounce.get(study.id);
  if (existing) clearTimeout(existing);
  debounce.set(
    study.id,
    setTimeout(() => {
      debounce.delete(study.id);
      runOrQueue(study, apply);
    }, 3000),
  );
}

function runOrQueue(study: Study, apply: Apply) {
  if (inFlight.has(study.id)) {
    queued.set(study.id, study);
    return;
  }
  inFlight.add(study.id);
  setStatus(study.id, { running: true, done: 0, total: 0 });
  void computeStudyWeights(study, (done, total) => {
    setStatus(study.id, { running: true, done, total });
  })
    .then((result) => {
      // Stamp the version only when every opponent FEN got a non-null
      // response. With <100% we leave the stamp off so the next mount
      // retries the still-failing FENs (the IDB cache means the ones that
      // already succeeded won't be refetched). Without this, a single
      // rate-limited fetch on an early position — say after 1.e4 — zeroed
      // out every line sharing that prefix, locked in by the stamp.
      const completed =
        result.totalFens === 0 || result.withData === result.totalFens;
      apply(study.id, result.weights, completed);
    })
    .catch((err) => {
      console.warn("Weight compute failed:", err);
    })
    .finally(() => {
      inFlight.delete(study.id);
      setStatus(study.id, null);
      const queuedStudy = queued.get(study.id);
      if (queuedStudy) {
        queued.delete(study.id);
        runOrQueue(queuedStudy, apply);
      }
    });
}
