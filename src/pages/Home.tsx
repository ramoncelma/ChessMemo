import { dueCount, nextReviewAt, formatCountdown } from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onDrill: () => void;
  onImport: () => void;
}

export function Home({ studies, onDrill, onImport }: Props) {
  const due = dueCount(studies);
  const totalPositions = studies.reduce((n, s) => n + s.cards.length, 0);
  const next = nextReviewAt(studies);

  return (
    <div className="page center">
      <h1 className="brand">ChessMemo</h1>
      <p className="muted">Train your chess by repetition</p>

      <div className="due-badge">
        <span className="due-number">{due}</span>
        <span className="muted">positions to review</span>
        {due === 0 && next && (
          <span className="next-hint">next in {formatCountdown(next)}</span>
        )}
      </div>

      {totalPositions === 0 ? (
        <>
          <p className="muted">Add a line to start training.</p>
          <button className="primary big" onClick={onImport}>
            Add your first line
          </button>
        </>
      ) : (
        <button className="primary big" disabled={due === 0} onClick={onDrill}>
          {due === 0 ? "All caught up" : `Review now (${due})`}
        </button>
      )}
    </div>
  );
}
