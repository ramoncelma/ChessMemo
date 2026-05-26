import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade } from "../srs";
import { type PositionItem } from "../useStudies";
import type { Line, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  positions: PositionItem[];
  studies: Study[];
  settings: Settings;
  updateLine: (studyId: string, line: Line) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "correct" | "wrong";

export function PositionDrill({
  positions,
  studies,
  settings,
  updateLine,
  onDone,
}: Props) {
  const [queue] = useState<PositionItem[]>(() => positions);
  const [index, setIndex] = useState(0);
  const [backlog, setBacklog] = useState<PositionItem[]>([]);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [hinted, setHinted] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);

  const inMain = index < queue.length;
  const current = inMain ? queue[index] : (backlog[0] ?? null);

  useEffect(() => {
    if (phase !== "correct") return;
    const t = setTimeout(() => resolve(true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, backlog]);

  if (!current) {
    const pct = answered ? Math.round((cleanCount / answered) * 100) : 0;
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">🎯</div>
          <h2>Session complete</h2>
          <p className="muted">
            {answered} positions{answered ? ` · ${pct}% first try` : ""}
          </p>
          <button className="primary big" onClick={onDone}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  const fen =
    phase === "awaiting"
      ? current.fenBefore
      : (() => {
          const p = new Chess(current.fenBefore);
          p.move({ from: current.from, to: current.to, promotion: "q" });
          return p.fen();
        })();

  function resolve(success: boolean) {
    const clean = success && !hinted;
    const item = current!;

    if (inMain) {
      // No scheduling effect by default. Optionally a miss resets the whole
      // line to the start of the cycle.
      if (!clean && settings.positionMissResetsLine) {
        const study = studies.find((s) => s.id === item.studyId);
        const line = study?.lines.find((l) => l.id === item.lineId);
        if (study && line) {
          updateLine(study.id, {
            ...line,
            attempts: line.attempts + 1,
            misses: line.misses + 1,
            fsrs: grade(line.fsrs, "again"),
          });
        }
      }
      if (!clean) setBacklog((b) => [...b, item]);
      setIndex((i) => i + 1);
      setAnswered((n) => n + 1);
      if (clean) setCleanCount((n) => n + 1);
    } else {
      setBacklog((b) => (clean ? b.slice(1) : [...b.slice(1), b[0]]));
    }
    setHinted(false);
    setPhase("awaiting");
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    const probe = new Chess(current!.fenBefore);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    setPhase(from === current!.from && to === current!.to ? "correct" : "wrong");
    return true;
  }

  const total = queue.length;
  const progress = inMain ? (index / total) * 100 : 100;

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
          {inMain ? `${index + 1}/${total}` : `↻${backlog.length}`}
        </span>
      </div>

      <div className="line-context">Guess the move for this position</div>

      <Board
        fen={fen}
        orientation={current.orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
        hintSquare={hinted && phase === "awaiting" ? current.from : undefined}
      />

      <div className="drill-status">
        {phase === "awaiting" && (
          <div className="awaiting-row">
            <span className="turn-pill">
              {current.orientation === "white" ? "White" : "Black"} to move
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
        {phase === "correct" && (
          <span className={`result ${hinted ? "wrong" : "correct"}`}>
            {hinted ? "Hinted —" : "✓"} {current.san}
          </span>
        )}
        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ Best move was <b>{current.san}</b>
            </span>
            <button className="primary big" onClick={() => resolve(false)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
