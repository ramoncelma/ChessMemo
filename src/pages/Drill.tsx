import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { grade, previewIntervals, type Grade } from "../srs";
import { dueCards, type DueItem } from "../useStudies";
import type { Card, Orientation, Study } from "../types";

interface Props {
  studies: Study[];
  updateCard: (studyId: string, card: Card) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "correct" | "wrong";

export function Drill({ studies, updateCard, onDone }: Props) {
  // Snapshot the due queue once when the session starts.
  const [queue] = useState<DueItem[]>(() => dueCards(studies));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [reviewed, setReviewed] = useState(0);

  const current = queue[index];

  const orientation: Orientation = useMemo(() => {
    const study = studies.find((s) => s.id === current?.studyId);
    return study?.orientation ?? "white";
  }, [studies, current]);

  if (!current) {
    return (
      <div className="page center">
        <h2>All done</h2>
        <p className="muted">No more cards due right now.</p>
        <p className="muted">Reviewed {reviewed} this session.</p>
        <button className="primary" onClick={onDone}>
          Back home
        </button>
      </div>
    );
  }

  const card = current.card;

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    // Validate the move is legal in this position (chess.js throws if not).
    const probe = new Chess(card.fen);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false; // illegal -> snap back
    }

    const correct = from === card.answerFrom && to === card.answerTo;
    setPhase(correct ? "correct" : "wrong");
    return true;
  }

  function answer(g: Grade) {
    updateCard(current.studyId, { ...card, fsrs: grade(card.fsrs, g) });
    setReviewed((n) => n + 1);
    setPhase("awaiting");
    setIndex((i) => i + 1);
  }

  // The board shows the answer move once revealed.
  const shownFen = useShownFen(card, phase);
  const intervals = previewIntervals(card.fsrs);

  return (
    <div className="page">
      <div className="drill-header">
        <span className="muted">
          {index + 1} / {queue.length}
        </span>
        <button className="link" onClick={onDone}>
          End
        </button>
      </div>

      <p className="line-context">{card.line || "Starting position"}</p>

      <Board
        fen={shownFen}
        orientation={orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
      />

      {phase === "awaiting" && (
        <p className="prompt">
          {orientation === "white" ? "White" : "Black"} to move — play your line
        </p>
      )}

      {phase === "wrong" && (
        <p className="feedback wrong">
          Not your move. The line plays <b>{card.answerSan}</b>.
        </p>
      )}
      {phase === "correct" && (
        <p className="feedback correct">
          Correct — <b>{card.answerSan}</b>
        </p>
      )}

      {phase !== "awaiting" && (
        <div className="grades">
          <button className="grade again" onClick={() => answer("again")}>
            Again<span>{intervals.again}</span>
          </button>
          <button className="grade hard" onClick={() => answer("hard")}>
            Hard<span>{intervals.hard}</span>
          </button>
          <button className="grade good" onClick={() => answer("good")}>
            Good<span>{intervals.good}</span>
          </button>
          <button className="grade easy" onClick={() => answer("easy")}>
            Easy<span>{intervals.easy}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// After an answer, advance the board so the played move is visible.
function useShownFen(card: Card, phase: Phase): string {
  return useMemo(() => {
    if (phase === "awaiting") return card.fen;
    const probe = new Chess(card.fen);
    probe.move({ from: card.answerFrom, to: card.answerTo, promotion: "q" });
    return probe.fen();
  }, [card, phase]);
}
