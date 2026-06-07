import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { MoveTree } from "../components/MoveTree";
import { EnginePanel } from "../components/EnginePanel";
import { PositionInfo } from "../components/PositionInfo";
import { lichessAnalysisUrl } from "../lichess";
import { arrowsFromEval, fetchEval, type EvalResult } from "../engine";
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
  const [evalResult, setEvalResult] = useState<EvalResult | null | "loading" | "none">(null);

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
  const nextNodes = current ? current.children : tree.children;

  useEffect(() => {
    setEvalResult(null);
  }, [fen]);

  async function runEval() {
    setEvalResult("loading");
    const r = await fetchEval(fen, settings.engineLines);
    setEvalResult(r ?? "none");
  }

  const turn = useMemo<"w" | "b">(() => {
    try {
      return new Chess(fen).turn();
    } catch {
      return "w";
    }
  }, [fen]);
  const arrows =
    settings.engineArrows && evalResult && typeof evalResult !== "string"
      ? arrowsFromEval(evalResult, turn)
      : [];

  useEffect(() => {
    if (!tree) return;
    function onKey(e: KeyboardEvent) {
      if (!tree) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") setPath((p) => p.slice(0, -1));
      else if (e.key === "ArrowRight")
        setPath((p) => {
          const cur = p[p.length - 1];
          const children = cur ? cur.children : tree.children;
          return children.length > 0 ? [...p, children[0]] : p;
        });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tree]);

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
            arrows={arrows}
          />
          {current?.comment && (
            <p className="read-comment">{current.comment}</p>
          )}
          <PositionInfo fen={fen} sans={sans} orientation={study.orientation} />
          <EnginePanel evalResult={evalResult} onAnalyze={runEval} />
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
            <button
              className="nav-btn"
              disabled={nextNodes.length === 0}
              onClick={() =>
                nextNodes.length > 0 && setPath((p) => [...p, nextNodes[0]])
              }
            >
              {t("read.nextBtn")}
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

          {nextNodes.length > 1 && (
            <div className="next-moves">
              <span className="muted small">
                {nextNodes.length} options:
              </span>
              <div className="move-choices">
                {nextNodes.map((n, i) => (
                  <button
                    key={i}
                    className={`move-choice ${i === 0 ? "main" : ""}`}
                    onClick={() => setPath((p) => [...p, n])}
                  >
                    {n.san}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="read-panel">
          <h3 className="section-label">{t("read.allLines")}</h3>
          <MoveTree children={tree.children} current={current} onSelect={setPath} />
        </div>
      </div>
    </div>
  );
}
