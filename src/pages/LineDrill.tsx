import { useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade } from "../srs";
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

function nextTrainee(line: Line, from: number, want: "w" | "b"): number {
  let i = from;
  while (i < line.moves.length && line.moves[i].color !== want) i++;
  return i;
}

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

  const inMain = lineIdx < queue.length;
  const current = inMain ? queue[lineIdx] : (backlog[0] ?? null);

  const orientation: Orientation =
    studies.find((s) => s.id === current?.studyId)?.orientation ?? "white";
  const want = orientation === "white" ? "w" : "b";

  if (!current) {
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

  const line = current.line;
  const tIdx = nextTrainee(line, moveIdx, want);
  const move = line.moves[tIdx];
  const playedSans = line.moves.slice(0, tIdx).map((m) => m.san).join(" ");

  let fen: string;
  if (phase === "done") fen = line.moves[line.moves.length - 1].fenAfter;
  else if (phase === "wrong") fen = move.fenAfter;
  else fen = move.fenBefore;

  function finishLine() {
    const clean = !mistake && !hinted;
    setLastClean(clean);
    // Scheduling is decided on the first pass only; the retry round just makes
    // the user produce the line cleanly without changing its schedule.
    if (inMain) {
      const l = current!.line;
      if (clean) {
        if (!freezeOnSuccess) {
          updateLine(current!.studyId, {
            ...l,
            attempts: l.attempts + 1,
            fsrs: grade(l.fsrs, "good"),
          });
        }
        void appendReview(true);
      } else {
        updateLine(current!.studyId, {
          ...l,
          attempts: l.attempts + 1,
          misses: l.misses + 1,
          fsrs: grade(l.fsrs, "again"),
        });
        void appendReview(false);
      }
    }
    setPhase("done");
  }

  function advancePast(idx: number) {
    const next = nextTrainee(line, idx + 1, want);
    if (next >= line.moves.length) {
      finishLine();
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
    if (from === move.from && to === move.to) {
      advancePast(tIdx);
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
    setPhase("awaiting");
  }

  const total = queue.length;
  const progress = inMain ? (lineIdx / total) * 100 : 100;
  const retrying = !inMain;

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
            <button className="primary big" onClick={() => advancePast(tIdx)}>
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
