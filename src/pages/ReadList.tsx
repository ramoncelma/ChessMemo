import type { Study } from "../types";

interface Props {
  studies: Study[];
  onRead: (id: string) => void;
  onImport: () => void;
}

export function ReadList({ studies, onRead, onImport }: Props) {
  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>Nothing to read</h2>
        <p className="muted">Import a PGN to browse its lines.</p>
        <button className="primary big" onClick={onImport}>
          Import PGN
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Read</h2>
      <p className="muted">Step through every line, with notes and analysis.</p>
      <ul className="list">
        {studies.map((s) => (
          <li key={s.id} className="list-item">
            <div>
              <div className="list-title">{s.name}</div>
              <div className="muted small">
                {s.chapters.length} chapter{s.chapters.length === 1 ? "" : "s"} ·
                plays {s.orientation}
              </div>
            </div>
            <button onClick={() => onRead(s.id)}>Read</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
