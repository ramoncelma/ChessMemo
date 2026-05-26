import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { promote, resetLevel, RESPONSE_TIMEOUT_MS } from "../srs";
import { appendReview } from "../storage";
import { lichessAnalysisUrl } from "../lichess";
import { type LineItem } from "../useStudies";
import type { Line, Orientation, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  items: LineItem[];
  studies: Study[];
  settings: Settings;
  updateLine: (studyId: string, line: Line) => void;
  freezeOnSuccess: boolean; // "Practice again": keep the date unless missed
  onDone: () => void;
}

type Phase = "awaiting" | "wrong" | "done";
type Timing = { idx: number; ms: number };

function nextTrainee(line: Line, from: number, want: "w" | "b"): number {
  let i = from;
  while (i < line.moves.length && line.moves[i].color !== want) i++;
  return i;
}

const CAP = 20; // keep at most this many response times per bucket

export function LineDrill({
  items,
  studies,
  settings,
  updateLine,
  freezeOnSuccess,
  onDone,
}: Props) {
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
  const moveStart = useRef(Date.now());

  const inMain = lineIdx < queue.length;
  const current = inMain ? queue[lineIdx] : (backlog[0] ?? null);

  const orientation: Orientation =
    studies.find((s) => s.id === current?.studyId)?.orientation ?? "white";
  const want = orientation === "white" ? "w" : "b";

  const line = current?.line ?? null;
  const tIdx = line ? nextTrainee(line, moveIdx, want) : 0;

  // Start the response timer whenever a new move is presented.
  useEffect(() => {
    if (phase !== "awaiting" || !line) return;
    moveStart.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Date.now() - moveStart.current), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tIdx, lineIdx, backlog.length]);

  if (!current || !line) {
    const pct = answered ? Math.round((cleanCount / answered) * 100) : 0;
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">♟</div>
          <h2>Session complete</h2>
          <p className="muted">
            {answered} lines{answered ? ` · ${pct}% clean` : ""}
          </p>
          <button className="primary big" onClick={onDone}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  const move = line.moves[tIdx];
  const playedSans = line.moves.slice(0, tIdx).map((m) => m.san).join(" ");

  let fen: string;
  if (phase === "done") fen = line.moves[line.moves.length - 1].fenAfter;
  else if (phase === "wrong") fen = move.fenAfter;
  else fen = move.fenBefore;

  function finishLine(localPending: Timing[], hadMistake: boolean) {
    const clean = !hadMistake && !hinted;
    setLastClean(clean);
    if (inMain) {
      const l = current!.line;
      // merge response times
      const moveTimes: Record<number, number[]> = { ...l.moveTimes };
      let total = 0;
      for (const t of localPending) {
        total += t.ms;
        moveTimes[t.idx] = [...(moveTimes[t.idx] ?? []), t.ms].slice(-CAP);
      }
      const lineTimes = [...l.lineTimes, total].slice(-CAP);

      let sched = l.sched;
      let attempts = l.attempts + 1;
      let misses = l.misses;
      if (clean) {
        if (!freezeOnSuccess) sched = promote(l.sched);
        void appendReview(true);
      } else {
        sched = resetLevel();
        misses += 1;
        void appendReview(false);
      }
      updateLine(current!.studyId, {
        ...l,
        attempts,
        misses,
        sched,
        lineTimes,
        moveTimes,
      });
    }
    setPhase("done");
  }

  function advancePast(idx: number, localPending: Timing[], hadMistake: boolean) {
    const next = nextTrainee(line!, idx + 1, want);
    if (next >= line!.moves.length) {
      finishLine(localPending, hadMistake);
    } else {
      setMoveIdx(idx + 1);
      setPhase("awaiting");
    }
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    const probe = new Chess(move.fenBefore);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    const ms = Date.now() - moveStart.current;
    const timedOut = ms > RESPONSE_TIMEOUT_MS;
    const localPending = inMain ? [...pending, { idx: tIdx, ms }] : pending;
    if (inMain) setPending(localPending);

    if (from === move.from && to === move.to) {
      const hadMistake = mistake || hinted || timedOut;
      if (timedOut) setMistake(true);
      advancePast(tIdx, localPending, hadMistake);
    } else {
      setMistake(true);
      setPhase("wrong");
    }
    return true;
  }

  function goNext() {
    if (inMain) {
      setAnswered((n) => n + 1);
      if (lastClean) setCleanCount((n) => n + 1);
      else setBacklog((b) => [...b, current!]);
      setLineIdx((i) => i + 1);
    } else {
      setBacklog((b) => (lastClean ? b.slice(1) : [...b.slice(1), b[0]]));
    }
    setMoveIdx(0);
    setMistake(false);
    setHinted(false);
    setPending([]);
    setPhase("awaiting");
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

      {retrying && <p className="retry-banner">Second chance — fix your misses</p>}

      <div className="line-context">{playedSans || "Starting position"}</div>

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
              {orientation === "white" ? "White" : "Black"} to move
            </span>
            <span className={`timer ${over ? "over" : ""}`}>
              ⏱ {(elapsed / 1000).toFixed(0)}s{over ? " · timed out" : ""}
            </span>
            <button
              className="hint-btn"
              disabled={hinted}
              onClick={() => setHinted(true)}
            >
              {hinted ? "Hint shown" : "💡 Hint"}
            </button>
          </div>
        )}

        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ The line plays <b>{move.san}</b>
            </span>
            <a
              className="analyze-link"
              href={lichessAnalysisUrl(playedSans, orientation)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Analyze on Lichess ↗
            </a>
            <button
              className="primary big"
              onClick={() => advancePast(tIdx, pending, true)}
            >
              Continue line
            </button>
          </div>
        )}

        {phase === "done" && (
          <div className="wrong-block">
            <span className={`result ${lastClean ? "correct" : "wrong"}`}>
              {lastClean ? "✓ Line complete — clean!" : "✕ Line had a mistake"}
            </span>
            <button className="primary big" onClick={goNext}>
              {inMain && lineIdx + 1 >= total && backlog.length === 0
                ? "Finish"
                : "Next line"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
