import { isDue } from "../srs";
import { dueCount } from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onReviewDue: () => void;
  onPracticeStudy: (id: string) => void;
  onImport: () => void;
}

export function Practice({
  studies,
  onReviewDue,
  onPracticeStudy,
  onImport,
}: Props) {
  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>Nothing to practice</h2>
        <p className="muted">Import a PGN to create your first opening.</p>
        <button className="primary big" onClick={onImport}>
          Import PGN
        </button>
      </div>
    );
  }

  const totalDue = dueCount(studies);
  const now = new Date();

  return (
    <div className="page">
      <h2>Practice</h2>

      <button className="primary big" disabled={totalDue === 0} onClick={onReviewDue}>
        {totalDue === 0 ? "All caught up" : `Review all due (${totalDue})`}
      </button>

      <section>
        <h3 className="section-label">Or practice one opening</h3>
        <ul className="list">
          {studies.map((s) => {
            const due = s.cards.filter((c) => isDue(c.fsrs, now)).length;
            return (
              <li key={s.id} className="list-item">
                <div>
                  <div className="list-title">{s.name}</div>
                  <div className="muted small">
                    {s.cards.length} positions · plays {s.orientation}
                    {due > 0 ? ` · ${due} due` : ""}
                  </div>
                </div>
                <button className="primary" onClick={() => onPracticeStudy(s.id)}>
                  Practice
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
