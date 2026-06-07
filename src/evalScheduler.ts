import { lookupEval } from "./engineCache";
import type { Study } from "./types";

// Background fetcher for leaf-position Stockfish evals. One eval per line
// (the line's final FEN). Cache hits are free; misses go through the
// Lichess Cloud Eval API at ~1 req/s. Runs once per study per page load
// unless the user manually refreshes evals from Settings.

export interface EvalApplyPayload {
  evals: Map<string, EvalApplyEntry>;
}

export interface EvalApplyEntry {
  cp?: number;
  mate?: number;
  depth?: number;
  notCached: boolean;
}

type Apply = (studyId: string, payload: EvalApplyPayload) => void;

export interface EvalStatus {
  running: boolean;
  done: number;
  total: number;
}

const debounce = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
const queued = new Map<string, Study>();
const status = new Map<string, EvalStatus>();
const listeners = new Set<() => void>();
const ranThisSession = new Set<string>();

export function subscribeEvalStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function getEvalStatus(studyId: string): EvalStatus | null {
  return status.get(studyId) ?? null;
}
function notify() {
  for (const fn of listeners) fn();
}
function setStatus(studyId: string, s: EvalStatus | null) {
  if (s === null) status.delete(studyId);
  else status.set(studyId, s);
  notify();
}

export function clearEvalRanThisSession() {
  ranThisSession.clear();
}

// Schedule a background eval pass for the given study. Only fires if at
// least one line lacks an eval (and hasn't already been recorded as
// notCached) — once every line has been resolved, this stops re-firing
// across reloads.
export function scheduleEvalCompute(study: Study, apply: Apply) {
  const hasMissing = study.lines.some(
    (l) =>
      l.evalCp === undefined &&
      l.evalMate === undefined &&
      !l.evalNotCached,
  );
  if (!hasMissing) return;
  if (ranThisSession.has(study.id)) return;
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
  void runStudy(study, apply).finally(() => {
    inFlight.delete(study.id);
    setStatus(study.id, null);
    const queuedStudy = queued.get(study.id);
    if (queuedStudy) {
      queued.delete(study.id);
      runOrQueue(queuedStudy, apply);
    }
  });
}

async function runStudy(study: Study, apply: Apply) {
  const targets: { lineId: string; fen: string }[] = [];
  for (const line of study.lines) {
    if (line.moves.length === 0) continue;
    if (
      line.evalCp !== undefined ||
      line.evalMate !== undefined ||
      line.evalNotCached
    )
      continue;
    targets.push({
      lineId: line.id,
      fen: line.moves[line.moves.length - 1].fenAfter,
    });
  }
  if (targets.length === 0) return;
  setStatus(study.id, { running: true, done: 0, total: targets.length });

  const evals = new Map<string, EvalApplyEntry>();
  let done = 0;
  for (const t of targets) {
    const r = await lookupEval(t.fen, 1);
    if (r) {
      evals.set(t.lineId, {
        cp: r.cp,
        mate: r.mate,
        depth: r.depth,
        notCached: r.notCached,
      });
    }
    done++;
    setStatus(study.id, { running: true, done, total: targets.length });
  }
  apply(study.id, { evals });
}
