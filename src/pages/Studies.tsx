import { isDue } from "../srs";
import { accuracy, nextReviewAt, formatCountdown } from "../stats";
import { CATEGORY_LABELS, type Category, type Study } from "../types";

interface Props {
  studies: Study[];
  removeStudy: (id: string) => void;
  onImport: () => void;
}

const ORDER: Category[] = ["opening", "tactic", "endgame"];

export function Studies({ studies, removeStudy, onImport }: Props) {
  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>No lines yet</h2>
        <p className="muted">Add a PGN to start training.</p>
        <button className="primary big" onClick={onImport}>
          Add a line
        </button>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="page">
      <div className="row">
        <h2>Your lines</h2>
        <button className="link" onClick={onImport}>
          + Add
        </button>
      </div>

      {ORDER.map((cat) => {
        const group = studies.filter((s) => s.category === cat);
        if (group.length === 0) return null;
        return (
          <section key={cat}>
            <h3 className="section-label">{CATEGORY_LABELS[cat]}</h3>
            <ul className="list">
              {group.map((s) => {
                const due = s.cards.filter((c) => isDue(c.fsrs, now)).length;
                const acc = accuracy(s.cards);
                const next = nextReviewAt([s], now);
                return (
                  <li key={s.id} className="list-item">
                    <div>
                      <div className="list-title">{s.name}</div>
                      <div className="muted small">
                        {s.cards.length} positions · plays {s.orientation}
                        {acc !== null && ` · ${acc}% correct`}
                      </div>
                    </div>
                    <div className="list-aside">
                      {due > 0 ? (
                        <span className="due-tag">{due} due</span>
                      ) : next ? (
                        <span className="muted small">
                          {formatCountdown(next, now)}
                        </span>
                      ) : null}
                      <button
                        className="link danger small"
                        onClick={() => {
                          if (confirm(`Delete "${s.name}"?`)) removeStudy(s.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
