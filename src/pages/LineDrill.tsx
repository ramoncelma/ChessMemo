import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade as gradeSched, RESPONSE_TIMEOUT_MS, type Grade } from "../srs";
import { appendReview } from "../storage";
import { lichessAnalysisUrl } from "../lichess";
import { useT } from "../i18n";
import { type LineItem } from "../useStudies";
import type { Line, Orientation, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  items: LineItem[];
  studies: Study[];
  settings: Settings;
  updateLine: (studyId: string, line: Line) => void;
  freezeOnSuccess: boolean; // "Practice again": keep the date unless missed
  onOpenRead: (studyId: string, lineId: string) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "opp" | "wrong" | "done";
type Timing = { idx: number; ms: number };

function nextTrainee(line: Line, from: number, want: "w" | "b"): number {
  let i = from;
  while (i < line.moves.length && line.moves[i].color !== want) i++;
  return i;
}

const CAP = 20; // keep at most this many response times per bucket

// Chapter-scoped index of (fenBefore + from+to+promo) -> the lines that contain
// such a move and at what ply. Used to recognise transpositions: if the user
// plays a move that isn't the current line's expected continuation but matches
// some other line's move from the same position, we switch the drill onto that
// line instead of calling it a miss.
type IndexEntry = { lineId: string; ply: number };
type PosIndex = Map<string, IndexEntry[]>;

function moveKey(fenBefore: string, from: string, to: string, promo?: string) {
  return `${fenBefore}|${from}${to}${promo ?? ""}`;
}

function buildPositionIndex(
  study: Study,
  chapterIdx: number,
  want: "w" | "b",
): PosIndex {
  const idx: PosIndex = new Map();
  for (const line of study.lines) {
    if (line.chapterIdx !== chapterIdx) continue;
    for (let i = 0; i < line.moves.length; i++) {
      const mv = line.moves[i];
      if (mv.color !== want) continue;
      const k = moveKey(mv.fenBefore, mv.from, mv.to, mv.promotion);
      const arr = idx.get(k) ?? [];
      arr.push({ lineId: line.id, ply: i });
      idx.set(k, arr);
    }
  }
  return idx;
}

export function LineDrill({
  items,
  studies,
  settings,
  updateLine,
  freezeOnSuccess,
  onOpenRead,
  onDone,
}: Props) {
  const t = useT();
  const [queue] = useState<LineItem[]>(() => items);
  const [lineIdx, setLineIdx] = useState(0);
  const [backlog, setBacklog] = useState<LineItem[]>([]);
  const [moveIdx, setMoveIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [mistake, setMistake] = useState(false);
  const [hinted, setHinted] = useState(false);
  const [lastClean, setLastClean] = useState(true);
  const [answered, setAnswered] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);
  const [pending, setPending] = useState<Timing[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [interFen, setInterFen] = useState<string | null>(null);
  const [effectiveLineId, setEffectiveLineId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [finishedSnapshot, setFinishedSnapshot] = useState<{
    studyId: string;
    line: Line;
    timing: Timing[];
    clean: boolean;
  } | null>(null);
  const moveStart = useRef(Date.now());

  const inMain = lineIdx < queue.length;
  const queued = inMain ? queue[lineIdx] : (backlog[0] ?? null);

  const study = useMemo(
    () => studies.find((s) => s.id === queued?.studyId) ?? null,
    [studies, queued?.studyId],
  );
  const orientation: Orientation = study?.orientation ?? "white";
  const want = orientation === "white" ? "w" : "b";

  // The line we're actually drilling: may differ from the queued line if the
  // user transposed into another line within the same chapter.
  const line: Line | null = useMemo(() => {
    if (!queued) return null;
    if (effectiveLineId && study) {
      const found = study.lines.find((l) => l.id === effectiveLineId);
      if (found) return found;
    }
    return queued.line;
  }, [queued, effectiveLineId, study]);

  const positionIndex = useMemo<PosIndex>(() => {
    if (!study || !queued) return new Map();
    return buildPositionIndex(study, queued.line.chapterIdx, want);
  }, [study, queued?.line.chapterIdx, want]);

  const tIdx = line ? nextTrainee(line, moveIdx, want) : 0;

  // Start the response timer whenever a new move is presented.
  useEffect(() => {
    if (phase !== "awaiting" || !line) return;
    moveStart.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - moveStart.current), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tIdx, lineIdx, backlog.length, effectiveLineId]);

  if (!queued || !line) {
    const pct = answered ? Math.round((cleanCount / answered) * 100) : 0;
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">♟</div>
          <h2>{t("drill.sessionComplete")}</h2>
          <p className="muted">
            {answered
              ? t("drill.linesSummary", { n: answered, pct })
              : t("drill.linesSummary0", { n: answered })}
          </p>
          <button className="primary big" onClick={onDone}>
            {t("common.backHome")}
          </button>
        </div>
      </div>
    );
  }

  const move = line.moves[tIdx];
  const playedSans = line.moves.slice(0, tIdx).map((m) => m.san).join(" ");

  let fen: string;
  if (interFen) fen = interFen;
  else if (phase === "done") fen = line.moves[line.moves.length - 1].fenAfter;
  else if (phase === "wrong") fen = move.fenAfter;
  else fen = move.fenBefore;

  function finishLine(localPending: Timing[], hadMistake: boolean) {
    const clean = !hadMistake && !hinted;
    setLastClean(clean);
    if (inMain && line && queued) {
      setFinishedSnapshot({
        studyId: queued.studyId,
        line,
        timing: localPending,
        clean,
      });
    } else {
      // Backlog replays don't re-grade — just record the outcome for goNext.
      setFinishedSnapshot(null);
    }
    setPhase("done");
  }

  function advancePast(idx: number, localPending: Timing[], hadMistake: boolean) {
    if (!line) return;
    const next = nextTrainee(line, idx + 1, want);
    if (next >= line.moves.length) {
      finishLine(localPending, hadMistake);
    } else {
      setMoveIdx(idx + 1);
      setPhase("awaiting");
    }
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting" || !line) return false;
    const probe = new Chess(move.fenBefore);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    const ms = Date.now() - moveStart.current;
    const timedOut = ms > RESPONSE_TIMEOUT_MS;
    const localPending =
      inMain && !replaying ? [...pending, { idx: tIdx, ms }] : pending;
    if (inMain && !replaying) setPending(localPending);

    // Exact match: continue along the current effective line.
    if (from === move.from && to === move.to) {
      const hadMistake = mistake || hinted || timedOut;
      if (timedOut) setMistake(true);
      setInterFen(move.fenAfter);
      setPhase("opp");
      setTimeout(() => {
        setInterFen(null);
        advancePast(tIdx, localPending, hadMistake);
      }, settings.opponentDelayMs);
      return true;
    }

    // Otherwise: check for a transposition into another line in the same
    // chapter. If the user's move appears anywhere in that chapter at the
    // same fenBefore, accept it and switch the effective line.
    const promo = (move.promotion ?? undefined) as string | undefined;
    const k1 = moveKey(move.fenBefore, from, to, promo);
    const k2 = moveKey(move.fenBefore, from, to);
    const candidates = positionIndex.get(k1) ?? positionIndex.get(k2);
    if (candidates && candidates.length > 0 && study) {
      // Prefer a candidate that isn't the current line (so we actually switch).
      const pick =
        candidates.find((c) => c.lineId !== line.id) ?? candidates[0];
      const newLine = study.lines.find((l) => l.id === pick.lineId);
      if (newLine) {
        // Treat as the user playing the expected move of the new line.
        const hadMistake = mistake || hinted || timedOut;
        if (timedOut) setMistake(true);
        setEffectiveLineId(newLine.id);
        setInterFen(newLine.moves[pick.ply].fenAfter);
        setPhase("opp");
        // We logged the timing keyed by old tIdx; remap to new line's ply for
        // consistency with the line we're crediting.
        const remapped =
          inMain && !replaying
            ? [...pending, { idx: pick.ply, ms }]
            : pending;
        if (inMain && !replaying) setPending(remapped);
        setTimeout(() => {
          setInterFen(null);
          const next = nextTrainee(newLine, pick.ply + 1, want);
          if (next >= newLine.moves.length) {
            finishLine(remapped, hadMistake);
          } else {
            setMoveIdx(pick.ply + 1);
            setPhase("awaiting");
          }
        }, settings.opponentDelayMs);
        return true;
      }
    }

    // No match — it's a wrong move.
    setMistake(true);
    setPhase("wrong");
    return true;
  }

  function applyGrade(g: Grade) {
    const snap = finishedSnapshot;
    if (snap) {
      const liveLine =
        studies.find((s) => s.id === snap.studyId)?.lines.find(
          (l) => l.id === snap.line.id,
        ) ?? snap.line;

      const moveTimes: Record<number, number[]> = { ...liveLine.moveTimes };
      let total = 0;
      for (const tm of snap.timing) {
        total += tm.ms;
        moveTimes[tm.idx] = [...(moveTimes[tm.idx] ?? []), tm.ms].slice(-CAP);
      }
      const lineTimes = [...liveLine.lineTimes, total].slice(-CAP);

      let sched = liveLine.sched;
      if (g === "good" && freezeOnSuccess && snap.clean) {
        // "Practice again" — keep schedule unchanged on a clean Good.
      } else {
        sched = gradeSched(liveLine.sched, g);
      }
      const attempts = liveLine.attempts + 1;
      const misses = liveLine.misses + (g === "again" ? 1 : 0);

      updateLine(snap.studyId, {
        ...liveLine,
        attempts,
        misses,
        sched,
        lineTimes,
        moveTimes,
      });
      void appendReview(g !== "again");
      setFinishedSnapshot(null);
    }
    goNext(g === "again");
  }

  function goNext(treatAsMiss: boolean) {
    if (inMain) {
      setAnswered((n) => n + 1);
      if (!treatAsMiss) setCleanCount((n) => n + 1);
      if (treatAsMiss && queued) setBacklog((b) => [...b, queued]);
      setLineIdx((i) => i + 1);
    } else {
      setBacklog((b) =>
        !treatAsMiss ? b.slice(1) : [...b.slice(1), b[0]],
      );
    }
    setMoveIdx(0);
    setMistake(false);
    setHinted(false);
    setPending([]);
    setEffectiveLineId(null);
    setReplaying(false);
    setPhase("awaiting");
  }

  function onMouseSlip() {
    // Forgive the current line's misses and continue past this move.
    setMistake(false);
    setHinted(false);
    advancePast(tIdx, pending, false);
  }

  function onContinueWrong() {
    if (settings.replayFromStartOnMiss) {
      // Replay from the top of the line; keep `mistake` true so the line is
      // graded "Again" at the end.
      setReplaying(true);
      setMoveIdx(0);
      setPhase("awaiting");
    } else {
      advancePast(tIdx, pending, true);
    }
  }

  const total = queue.length;
  const progress = inMain ? (lineIdx / total) * 100 : 100;
  const retrying = !inMain;
  const over = elapsed > RESPONSE_TIMEOUT_MS;

  return (
    <div className="page drill">
      <div className="drill-top">
        <button className="icon-btn" onClick={onDone} aria-label="End session">
          ✕
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="counter">
          {inMain ? `${lineIdx + 1}/${total}` : `↻${backlog.length}`}
        </span>
      </div>

      {retrying && <p className="retry-banner">{t("drill.secondChance")}</p>}
      {replaying && (
        <p className="retry-banner">Replaying the whole line from move 1.</p>
      )}
      {effectiveLineId && (
        <p className="muted small">
          Transposition recognised — continuing on the matching line.
        </p>
      )}

      <div className="line-context">{playedSans || t("common.startingPosition")}</div>

      <Board
        fen={fen}
        orientation={orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
        hintSquare={hinted && phase === "awaiting" ? move.from : undefined}
      />

      <div className="drill-status">
        {phase === "awaiting" && (
          <div className="awaiting-row">
            <span className="turn-pill">
              {t("drill.toMove", {
                side: orientation === "white" ? t("common.white") : t("common.black"),
              })}
            </span>
            <span className={`timer ${over ? "over" : ""}`}>
              ⏱ {(elapsed / 1000).toFixed(0)}s{over ? t("drill.timedOut") : ""}
            </span>
            <button
              className="hint-btn"
              disabled={hinted}
              onClick={() => setHinted(true)}
            >
              {hinted ? t("drill.hintShown") : t("drill.hint")}
            </button>
          </div>
        )}

        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ {t("drill.linePlays")} <b>{move.san}</b>
            </span>
            <div className="wrong-links">
              <a
                className="analyze-link"
                href={lichessAnalysisUrl(playedSans, orientation)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("drill.analyze")}
              </a>
              <button
                className="analyze-link"
                onClick={() => onOpenRead(queued.studyId, line.id)}
              >
                {t("drill.openRead")}
              </button>
            </div>
            <div className="row wrong-actions">
              <button className="link" onClick={onMouseSlip}>
                Mouse slip
              </button>
              <button className="primary big" onClick={onContinueWrong}>
                {t("drill.continue")}
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="wrong-block">
            <span className={`result ${lastClean ? "correct" : "wrong"}`}>
              {lastClean ? t("drill.clean") : t("drill.hadMistake")}
            </span>
            {inMain ? (
              <div className="grade-row">
                <button className="grade again" onClick={() => applyGrade("again")}>
                  Again
                </button>
                <button className="grade hard" onClick={() => applyGrade("hard")}>
                  Hard
                </button>
                <button
                  className={`grade good ${lastClean ? "primary" : ""}`}
                  onClick={() => applyGrade("good")}
                >
                  Good
                </button>
                <button className="grade easy" onClick={() => applyGrade("easy")}>
                  Easy
                </button>
              </div>
            ) : (
              <button
                className="primary big"
                onClick={() => goNext(!lastClean)}
              >
                {backlog.length <= 1
                  ? t("drill.finish")
                  : t("drill.nextLine")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

