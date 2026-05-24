import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade } from "../srs";
import { dueCards, type DueItem } from "../useStudies";
import type { Card, Orientation, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  studies: Study[];
  settings: Settings;
  updateCard: (studyId: string, card: Card) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "correct" | "wrong";

export function Drill({ studies, settings, updateCard, onDone }: Props) {
  const [queue] = useState<DueItem[]>(() => dueCards(studies));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [reviewed, setReviewed] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const current = queue[index];
  const card = current?.card;

  const orientation: Orientation = useMemo(() => {
    const study = studies.find((s) => s.id === current?.studyId);
    return study?.orientation ?? "white";
  }, [studies, current]);

  // After a correct move, briefly show it then advance automatically.
  useEffect(() => {
    if (phase !== "correct" || !card) return;
    const t = setTimeout(() => commit("good"), 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const shownFen = useMemo(() => {
    if (!card) return "";
    if (phase === "awaiting") return card.fen;
    const probe = new Chess(card.fen);
    probe.move({ from: card.answerFrom, to: card.answerTo, promotion: "q" });
    return probe.fen();
  }, [card, phase]);

  if (!current || !card) {
    const total = reviewed || 1;
    const pct = Math.round((correctCount / total) * 100);
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">♟</div>
          <h2>Session complete</h2>
          <p className="muted">
            {reviewed} reviewed · {reviewed ? `${pct}% first-try` : "nothing due"}
          </p>
          <button className="primary big" onClick={onDone}>
            Back home
          </button>
        </div>
      </div>
    );
  }

  function commit(g: "good" | "again") {
    updateCard(current.studyId, { ...card!, fsrs: grade(card!.fsrs, g) });
    setReviewed((n) => n + 1);
    setPhase("awaiting");
    setIndex((i) => i + 1);
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    const probe = new Chess(card!.fen);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false; // illegal -> snap back
    }
    if (from === card!.answerFrom && to === card!.answerTo) {
      setCorrectCount((n) => n + 1);
      setPhase("correct");
    } else {
      setPhase("wrong");
    }
    return true;
  }

  const progress = (index / queue.length) * 100;

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
          {index + 1}/{queue.length}
        </span>
      </div>

      <div className="line-context">{card.line || "Starting position"}</div>

      <Board
        fen={shownFen}
        orientation={orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
      />

      <div className="drill-status">
        {phase === "awaiting" && (
          <span className="turn-pill">
            {orientation === "white" ? "White" : "Black"} to move
          </span>
        )}
        {phase === "correct" && (
          <span className="result correct">✓ {card.answerSan}</span>
        )}
        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ The line plays <b>{card.answerSan}</b>
            </span>
            <button className="primary big" onClick={() => commit("again")}>
              Got it — next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
