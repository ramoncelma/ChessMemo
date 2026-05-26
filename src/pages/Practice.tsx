import { dueCount, retention } from "../stats";
import { LEVEL_NAMES } from "../srs";
import {
  chapterItems,
  dueCards,
  positionItems,
  studyItems,
  type DueItem,
} from "../useStudies";
import type { DrillMode } from "./Drill";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onStart: (items: DueItem[], mode: DrillMode) => void;
  onImport: () => void;
}

function LevelBar({ cards }: { cards: Study["cards"] }) {
  const r = retention(cards);
  if (r.total === 0) return null;
  return (
    <div className="levels">
      <div className="level-bar">
        {r.levels.map((count, i) =>
          count > 0 ? (
            <span
              key={i}
              className={`level-seg lvl-${i}`}
              style={{ width: `${(count / r.total) * 100}%` }}
              title={`${LEVEL_NAMES[i]}: ${count}`}
            />
          ) : null,
        )}
      </div>
      <span className="muted small">{r.retainedPct}% retained</span>
    </div>
  );
}

export function Practice({ studies, onStart, onImport }: Props) {
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

  return (
    <div className="page">
      <h2>Practice</h2>

      <button
        className="primary big"
        disabled={totalDue === 0}
        onClick={() => onStart(dueCards(studies), "line")}
      >
        {totalDue === 0 ? "All caught up" : `Review all due (${totalDue})`}
      </button>

      {studies.map((s) => (
        <section key={s.id} className="study-card">
          <div className="list-title">{s.name}</div>
          <div className="muted small">
            {s.cards.length} positions · plays {s.orientation}
          </div>
          <LevelBar cards={s.cards} />

          <div className="practice-modes">
            <button onClick={() => onStart(studyItems(s), "line")}>
              Practice line
            </button>
            <button
              onClick={() => onStart(positionItems(studyItems(s)), "position")}
            >
              Practice position
            </button>
          </div>

          {s.chapters.length > 1 && (
            <ul className="chapter-list">
              {s.chapters.map((ch, i) => (
                <li key={i} className="chapter-row">
                  <span className="muted small chapter-name">{ch.name}</span>
                  <div className="chapter-actions">
                    <button
                      className="link small"
                      onClick={() => onStart(chapterItems(s, i), "line")}
                    >
                      Line
                    </button>
                    <button
                      className="link small"
                      onClick={() =>
                        onStart(positionItems(chapterItems(s, i)), "position")
                      }
                    >
                      Position
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
