import { computeStudyWeights } from "./weights";
import type { Study } from "./types";

type Apply = (studyId: string, weights: Map<string, number>) => void;

const debounce = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
const queued = new Map<string, Study>();

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
  void computeStudyWeights(study)
    .then((weights) => {
      apply(study.id, weights);
    })
    .catch((err) => {
      console.warn("Weight compute failed:", err);
    })
    .finally(() => {
      inFlight.delete(study.id);
      const queuedStudy = queued.get(study.id);
      if (queuedStudy) {
        queued.delete(study.id);
        runOrQueue(queuedStudy, apply);
      }
    });
}
