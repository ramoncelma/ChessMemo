import { useT } from "../i18n";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onRead: (id: string) => void;
  onImport: () => void;
}

export function ReadList({ studies, onRead, onImport }: Props) {
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

  return (
    <div className="page">
      <h2>{t("read.title")}</h2>
      <p className="muted">{t("read.subtitle")}</p>
      <ul className="list">
        {studies.map((s) => (
          <li key={s.id} className="list-item">
            <div>
              <div className="list-title">{s.name}</div>
              <div className="muted small">
                {t("practice.linesCount", {
                  n: s.lines.length,
                  side: s.orientation === "white" ? t("common.white") : t("common.black"),
                })}
              </div>
            </div>
            <button onClick={() => onRead(s.id)}>{t("read.title")}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
