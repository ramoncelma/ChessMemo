import { useT } from "../i18n";
import { RETAINED_LEVEL } from "../srs";
import { chapterCoverage, formatCoverage } from "../coverage";
import type { Study } from "../types";

interface Props {
  study: Study;
  onPick: (chapterIdx: number) => void;
}

// Card-grid presentation of a study's chapters. Used by Practice and Read
// when settings.chapterView === "grid". Each card shows the chapter name,
// how many of its lines are well-memorised (level >= RETAINED_LEVEL), and a
// progress bar.
export function ChapterGrid({ study, onPick }: Props) {
  const t = useT();
  return (
    <div className="chapter-grid">
      {study.chapters.map((ch, i) => {
        const lines = study.lines.filter((l) => l.chapterIdx === i);
        const total = lines.length;
        const learned = lines.filter((l) => l.sched.level >= RETAINED_LEVEL).length;
        const pct = total === 0 ? 0 : Math.round((learned / total) * 100);
        const complete = total > 0 && learned === total;
        const coverage = chapterCoverage(study, i);
        return (
          <button
            key={i}
            className="chapter-card"
            onClick={() => onPick(i)}
          >
            <div className="chapter-card-name">{ch.name}</div>
            <div className="chapter-card-stat">
              <span className="muted small">
                {t("practice.varsCount", { learned, total })}
              </span>
              {complete && <span className="chapter-card-tick">✓</span>}
            </div>
            <div className="chapter-card-bar">
              <div
                className="chapter-card-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="chapter-card-pct muted small">{pct}%</div>
            {coverage > 0 && (
              <div className="chapter-card-coverage muted small">
                Coverage: {formatCoverage(coverage)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
