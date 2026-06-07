import { computeStudyWeightsDual, type FetchStats } from "./weights";
import type { Study, Wdb } from "./types";

// Weights need the Lichess masters explorer, which 401's anonymous requests
// on some networks. Without a personal token the whole compute is skipped so
// we don't burn a study's worth of FENs into a wall of 401s — the UI just
// shows no weight tags until a token is pasted in Settings.
function hasLichessToken(): boolean {
  try {
    return ((localStorage.getItem("chessmemo.lichessToken") ?? "").trim()).length > 0;
  } catch {
    return false;
  }
}

export interface WeightApplyPayload {
  weights: Map<string, number>;
  weightsLichess: Map<string, number>;
  gmWdb: Map<string, Wdb>;
  lichessWdb: Map<string, Wdb>;
  lichessFiltersSignature: string;
}

type Apply = (
  studyId: string,
  payload: WeightApplyPayload,
  completed: boolean,
) => void;

export interface WeightStatus {
  running: boolean;
  done: number;
  total: number;
  stats: FetchStats;
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

// Called by the manual "Refresh GM weights" button. Lets the auto-trigger
// schedule another run on this page load for every study.
export function clearRanThisSession() {
  ranThisSession.clear();
}

// Schedule a background recompute for the given study. Multiple rapid calls
// (e.g. several edits in a row) collapse into one run thanks to the debounce.
// If a recompute is already running for this study, the latest snapshot is
// queued and processed once the current run completes.
export function scheduleWeightCompute(study: Study, apply: Apply) {
  if (!hasLichessToken()) return;
  // Allow a re-run if there are new lines without weights yet (e.g. the user
  // just added a chapter); otherwise honour the one-per-session lock.
  const hasMissing = study.lines.some(
    (l) => l.weight === undefined || l.weightLichess === undefined,
  );
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
  setStatus(study.id, {
    running: true,
    done: 0,
    total: 0,
    stats: { fetched: 0, cached: 0, failed: 0 },
  });
  void computeStudyWeightsDual(study, (done, total, stats) => {
    setStatus(study.id, { running: true, done, total, stats });
  })
    .then((result) => {
      // Stamp the version when at least 95% of FENs returned a real GM
      // response. Lichess can be sparser (especially with restrictive
      // rating bands) so we don't gate completion on it — sparse Lichess
      // data is the user's filter choice, not a transient failure.
      const completed =
        result.totalFens === 0 ||
        result.withDataGm / result.totalFens >= 0.95;
      apply(
        study.id,
        {
          weights: result.weights,
          weightsLichess: result.weightsLichess,
          gmWdb: result.gmWdb,
          lichessWdb: result.lichessWdb,
          lichessFiltersSignature: result.lichessFiltersSignature,
        },
        completed,
      );
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
