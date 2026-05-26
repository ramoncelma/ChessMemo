import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade } from "../srs";
import { appendReview } from "../storage";
import { lichessAnalysisUrl } from "../lichess";
import { type DueItem } from "../useStudies";
import type { Card, Orientation, Study } from "../types";
import type { Settings } from "../settings";

export type DrillMode = "line" | "position";

interface Props {
  items: DueItem[];
  mode: DrillMode;
  studies: Study[];
  settings: Settings;
  updateCard: (studyId: string, card: Card) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "correct" | "wrong";

export function Drill({
  items,
  mode,
  studies,
  settings,
  updateCard,
  onDone,
}: Props) {
  const [queue] = useState<DueItem[]>(() => items);
  const [index, setIndex] = useState(0);
  const [backlog, setBacklog] = useState<DueItem[]>([]);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [hinted, setHinted] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);

  const inMain = index < queue.length;
  const current = inMain ? queue[index] : (backlog[0] ?? null);
  const retrying = !inMain && backlog.length > 0;
  const card = current?.card ?? null;

  const orientation: Orientation = useMemo(() => {
    const study = studies.find((s) => s.id === current?.studyId);
    return study?.orientation ?? "white";
  }, [studies, current]);

  useEffect(() => {
    if (phase !== "correct") return;
    const t = setTimeout(() => resolve(true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, backlog]);

  const shownFen = useMemo(() => {
    if (!card) return "";
    if (phase === "awaiting") return card.fen;
    const probe = new Chess(card.fen);
    probe.move({ from: card.answerFrom, to: card.answerTo, promotion: "q" });
    return probe.fen();
  }, [card, phase]);

  if (!current || !card) {
    const pct = answered ? Math.round((cleanCount / answered) * 100) : 0;
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">♟</div>
          <h2>Session complete</h2>
          <p className="muted">
            {answered} answered{answered ? ` · ${pct}% clean first-try` : ""}
          </p>
          <button className="primary big" onClick={onDone}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  function resolve(success: boolean) {
    const clean = success && !hinted;
    const item = current!;
    const c = item.card;

    if (inMain) {
      if (mode === "line") {
        updateCard(item.studyId, {
          ...c,
          attempts: c.attempts + 1,
          misses: c.misses + (clean ? 0 : 1),
          fsrs: grade(c.fsrs, clean ? "good" : "again"),
        });
        void appendReview(clean);
      } else if (!clean && settings.positionMissResetsLine) {
        // Position mode normally doesn't touch scheduling, but the user can opt
        // to have a miss bump the line back to the starting bucket.
        updateCard(item.studyId, {
          ...c,
          attempts: c.attempts + 1,
          misses: c.misses + 1,
          fsrs: grade(c.fsrs, "again"),
        });
      }
      if (!clean) setBacklog((b) => [...b, item]);
      setIndex((i) => i + 1);
      setAnswered((n) => n + 1);
      if (clean) setCleanCount((n) => n + 1);
    } else {
      // Retry round: cycle until the move is produced cleanly. No scheduling
      // change here — the first attempt already set that.
      setBacklog((b) => (clean ? b.slice(1) : [...b.slice(1), b[0]]));
    }

    setHinted(false);
    setPhase("awaiting");
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    const probe = new Chess(card!.fen);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    if (from === card!.answerFrom && to === card!.answerTo) {
      setPhase("correct");
    } else {
      setPhase("wrong");
    }
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

      {retrying && (
        <p className="retry-banner">Second chance — fix your misses</p>
      )}

      {mode === "line" && (
        <div className="line-context">{card.line || "Starting position"}</div>
      )}
      {mode === "position" && (
        <div className="line-context">Find the move for this position</div>
      )}

      <Board
        fen={shownFen}
        orientation={orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
        hintSquare={hinted && phase === "awaiting" ? card.answerFrom : undefined}
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
        {phase === "correct" && (
          <span className={`result ${hinted ? "wrong" : "correct"}`}>
            {hinted ? "Hinted —" : "✓"} {card.answerSan}
          </span>
        )}
        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ The line plays <b>{card.answerSan}</b>
            </span>
            <a
              className="analyze-link"
              href={lichessAnalysisUrl(card.line, orientation)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Analyze on Lichess ↗
            </a>
            <button className="primary big" onClick={() => resolve(false)}>
              Got it — next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
