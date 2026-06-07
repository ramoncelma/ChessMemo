import { useT, levelName } from "../i18n";
import { retention } from "../stats";
import {
  studyCoverage,
  formatCoverage,
  formatOneIn,
} from "../coverage";
import type { Line, Study } from "../types";

interface Props {
  studies: Study[];
  onRead: (id: string) => void;
  onImport: () => void;
  onOpenInExplorer?: (studyId: string, sans: string[]) => void;
}

export function ReadList({ studies, onRead, onImport, onOpenInExplorer }: Props) {
  const t = useT();

  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>{t("read.nothing")}</h2>
        <p className="muted">{t("read.nothingSub")}</p>
        <button className="primary big" onClick={onImport}>
          {t("box.import")}
        </button>
      </div>
    );
  }

  function LevelBar({ lines }: { lines: Line[] }) {
    const r = retention(lines);
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
                title={`${levelName(t, i)}: ${count}`}
              />
            ) : null,
          )}
        </div>
        <span className="muted small">
          {t("practice.retainedPct", { n: r.retainedPct })}
        </span>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>{t("read.title")}</h2>
      <p className="muted">{t("read.subtitle")}</p>

      {studies.map((s) => {
        const side =
          s.orientation === "white" ? t("common.white") : t("common.black");
        return (
          <section key={s.id} className="study-card">
            <div className="list-title">{s.name}</div>
            <div className="muted small">
              {t("practice.linesCount", { n: s.lines.length, side })}
            </div>
            <LevelBar lines={s.lines} />
            {(() => {
              const cov = studyCoverage(s);
              if (cov === 0) return null;
              const oneIn = formatOneIn(cov);
              return (
                <div className="muted small">
                  Repertoire coverage:{" "}
                  <strong>{formatCoverage(cov)}</strong>
                  {oneIn && <> · {oneIn} master games</>}
                </div>
              );
            })()}

            <div className="practice-modes">
              <button className="primary" onClick={() => onRead(s.id)}>
                Read chapters
              </button>
              {onOpenInExplorer && (
                <button onClick={() => onOpenInExplorer(s.id, [])}>
                  Explorer ⌕
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
