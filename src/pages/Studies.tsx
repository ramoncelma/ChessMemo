import { isDue } from "../srs";
import { accuracy, nextReviewAt, formatCountdown } from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  removeStudy: (id: string) => void;
  onImport: () => void;
  onRead: (id: string) => void;
  onPractice: (id: string) => void;
}

export function Studies({
  studies,
  removeStudy,
  onImport,
  onRead,
  onPractice,
}: Props) {
  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>No openings yet</h2>
        <p className="muted">Add a PGN to start training.</p>
        <button className="primary big" onClick={onImport}>
          Add an opening
        </button>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="page">
      <div className="row">
        <h2>Openings</h2>
        <button className="link" onClick={onImport}>
          + Add
        </button>
      </div>

      <ul className="list">
        {studies.map((s) => {
          const due = s.cards.filter((c) => isDue(c.fsrs, now)).length;
          const acc = accuracy(s.cards);
          const next = nextReviewAt([s], now);
          return (
            <li key={s.id} className="study-card">
              <div className="study-head">
                <div className="list-title">{s.name}</div>
                <button
                  className="link danger small"
                  onClick={() => {
                    if (confirm(`Delete "${s.name}"?`)) removeStudy(s.id);
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="muted small">
                {s.cards.length} positions · plays {s.orientation}
                {acc !== null && ` · ${acc}% correct`}
                {due > 0
                  ? ` · ${due} due`
                  : next
                    ? ` · next ${formatCountdown(next, now)}`
                    : ""}
              </div>
              <div className="study-actions">
                <button onClick={() => onRead(s.id)}>Read</button>
                <button className="primary" onClick={() => onPractice(s.id)}>
                  Practice
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
