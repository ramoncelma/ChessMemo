import { computeStudyWeights } from "./weights";
import type { Study } from "./types";

type Apply = (studyId: string, weights: Map<string, number>) => void;

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
    .then((weights) => {
      apply(study.id, weights);
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
