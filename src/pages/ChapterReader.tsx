import { useMemo, useState } from "react";
import { Board } from "../components/Board";
import { MoveTree } from "../components/MoveTree";
import { lichessAnalysisUrl } from "../lichess";
import { parsePgn, type PgnNode } from "../pgnTree";
import { useT } from "../i18n";
import { chapterLineItems, type LineItem } from "../useStudies";
import type { Settings } from "../settings";
import type { Study } from "../types";

interface Props {
  study: Study;
  chapterIdx: number;
  settings: Settings;
  onBack: () => void;
  onPractice: (items: LineItem[], freeze: boolean) => void;
}

export function ChapterReader({
  study,
  chapterIdx,
  settings,
  onBack,
  onPractice,
}: Props) {
  const t = useT();
  const chapter = study.chapters[chapterIdx];
  const tree = useMemo(() => {
    try {
      return chapter ? parsePgn(chapter.pgn) : null;
    } catch {
      return null;
    }
  }, [chapter]);
  const [path, setPath] = useState<PgnNode[]>([]);

  if (!tree) {
    return (
      <div className="page">
        <div className="row">
          <button className="link" onClick={onBack}>
            {t("common.back")}
          </button>
        </div>
        <p className="muted">—</p>
      </div>
    );
  }

  const current = path[path.length - 1] ?? null;
  const fen = current ? current.fenAfter : tree.startFen;
  const sans = path.map((n) => n.san).join(" ");

  return (
    <div className="page read-page">
      <div className="row">
        <button className="link" onClick={onBack}>
          {t("common.back")}
        </button>
        <button
          className="link"
          onClick={() => onPractice(chapterLineItems(study, chapterIdx), false)}
        >
          {t("practice.chapter")} ▶
        </button>
      </div>

      <div className="line-context">{chapter.name}</div>

      <div className="read-layout">
        <div className="read-board">
          <Board
            fen={fen}
            orientation={study.orientation}
            draggable={false}
            onDrop={() => false}
            boardThemeId={settings.boardThemeId}
            pieceSet={settings.pieceSet}
          />
          {current?.comment && (
            <p className="read-comment">{current.comment}</p>
          )}
          <div className="read-controls">
            <button
              className="nav-btn"
              disabled={path.length === 0}
              onClick={() => setPath([])}
            >
              {t("read.start")}
            </button>
            <button
              className="nav-btn"
              disabled={path.length === 0}
              onClick={() => setPath((p) => p.slice(0, -1))}
            >
              {t("read.prev")}
            </button>
            <a
              className="analyze-link"
              href={lichessAnalysisUrl(sans, study.orientation)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("read.lichess")}
            </a>
          </div>
        </div>

        <div className="read-panel">
          <h3 className="section-label">{t("read.allLines")}</h3>
          <MoveTree children={tree.children} current={current} onSelect={setPath} />
        </div>
      </div>
    </div>
  );
}
