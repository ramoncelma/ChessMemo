import { isDue } from "../srs";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  removeStudy: (id: string) => void;
  onImport: () => void;
}

export function Studies({ studies, removeStudy, onImport }: Props) {
  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>No studies yet</h2>
        <p className="muted">Import a PGN to start training.</p>
        <button className="primary" onClick={onImport}>
          Import a study
        </button>
      </div>
    );
  }

  const now = new Date();
  return (
    <div className="page">
      <h2>Studies</h2>
      <ul className="list">
        {studies.map((s) => {
          const due = s.cards.filter((c) => isDue(c.fsrs, now)).length;
          return (
            <li key={s.id} className="list-item">
              <div>
                <div className="list-title">{s.name}</div>
                <div className="muted small">
                  {s.cards.length} cards · plays {s.orientation} · {due} due
                </div>
              </div>
              <button
                className="link danger"
                onClick={() => {
                  if (confirm(`Delete "${s.name}"?`)) removeStudy(s.id);
                }}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      <button className="primary" onClick={onImport}>
        Import another
      </button>
    </div>
  );
}
