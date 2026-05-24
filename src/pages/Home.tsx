import { dueCards } from "../useStudies";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onDrill: () => void;
  onImport: () => void;
}

export function Home({ studies, onDrill, onImport }: Props) {
  const due = dueCards(studies).length;
  const totalCards = studies.reduce((n, s) => n + s.cards.length, 0);

  return (
    <div className="page center">
      <h1 className="brand">ChessMemo</h1>
      <p className="muted">Spaced repetition for your chess lines</p>

      <div className="due-badge">
        <span className="due-number">{due}</span>
        <span className="muted">cards due</span>
      </div>

      {totalCards === 0 ? (
        <>
          <p className="muted">Import a study to get started.</p>
          <button className="primary" onClick={onImport}>
            Import a study
          </button>
        </>
      ) : (
        <button className="primary" disabled={due === 0} onClick={onDrill}>
          {due === 0 ? "Nothing due" : `Start drill (${due})`}
        </button>
      )}
    </div>
  );
}
