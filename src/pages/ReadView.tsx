import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { lichessAnalysisUrl } from "../lichess";
import { arrowsFromEval, fetchEval, type EvalResult } from "../engine";
import { isDue } from "../srs";
import { nowSrs } from "../clock";
import { formatCountdown, summarizeTimes } from "../stats";
import { useT } from "../i18n";
import { LevelBadge } from "../components/LevelBadge";
import { EnginePanel } from "../components/EnginePanel";
import { ChapterGrid } from "../components/ChapterGrid";
import { chapterDivergence } from "../divergence";
import { ChapterReader } from "./ChapterReader";
import { chapterLineItems, type LineItem } from "../useStudies";
import type { Line, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  study: Study;
  settings: Settings;
  initialLineId?: string | null;
  onBack: () => void;
  onPractice: (items: LineItem[], freeze: boolean) => void;
  setPaused: (studyId: string, lineId: string, paused: boolean) => void;
  pauseLowWeight: (studyId: string, chapterIdx: number, threshold: number) => void;
  resumeAllInChapter: (studyId: string, chapterIdx: number) => void;
}

export function ReadView({
  study,
  settings,
  initialLineId,
  onBack,
  onPractice,
  setPaused,
  pauseLowWeight,
  resumeAllInChapter,
}: Props) {
  const t = useT();
  const useGrid = settings.chapterView === "grid" && study.chapters.length > 1;
  const initialChapter: number | null = initialLineId
    ? (study.lines.find((l) => l.id === initialLineId)?.chapterIdx ?? 0)
    : useGrid
      ? null
      : 0;
  const [chapterIdx, setChapterIdx] = useState<number | null>(initialChapter);
  const [openLineId, setOpenLineId] = useState<string | null>(initialLineId ?? null);
  const [allLines, setAllLines] = useState(false);

  const activeChapter = chapterIdx ?? 0;
  // Sort lines by their SAN sequence so siblings of the same parent variation
  // sit next to each other in the list. Combined with the shared/unique
  // colouring of moves, this gives a tree-like read of the chapter.
  const chapterLines = study.lines
    .filter((l) => l.chapterIdx === activeChapter)
    .slice()
    .sort((a, b) => {
      const ai = a.moves.length;
      const bi = b.moves.length;
      const max = Math.max(ai, bi);
      for (let i = 0; i < max; i++) {
        const as = a.moves[i]?.san ?? "";
        const bs = b.moves[i]?.san ?? "";
        if (as !== bs) return as < bs ? -1 : 1;
      }
      return ai - bi;
    });
  const divergenceMap = chapterDivergence(study.lines, activeChapter);
  const openLine = study.lines.find((l) => l.id === openLineId) ?? null;

  if (allLines) {
    return (
      <ChapterReader
        study={study}
        chapterIdx={activeChapter}
        settings={settings}
        onBack={() => setAllLines(false)}
        onPractice={onPractice}
      />
    );
  }

  // Grid-mode chapter picker: shown when the user has entered the study but
  // hasn't picked a chapter yet.
  if (useGrid && chapterIdx === null) {
    return (
      <div className="page">
        <div className="row">
          <button className="link" onClick={onBack}>
            {t("common.back")}
          </button>
          <span className="muted small">{study.name}</span>
        </div>
        <ChapterGrid study={study} onPick={(i) => setChapterIdx(i)} />
      </div>
    );
  }

  if (openLine) {
    return (
      <LineBrowser
        study={study}
        line={openLine}
        settings={settings}
        onBack={() => setOpenLineId(null)}
        onPractice={onPractice}
      />
    );
  }

  const now = nowSrs();

  return (
    <div className="page">
      <div className="row">
        <button
          className="link"
          onClick={() => {
            if (useGrid) setChapterIdx(null);
            else onBack();
          }}
        >
          {t("common.back")}
        </button>
        <span className="muted small">{study.name}</span>
      </div>

      {!useGrid && study.chapters.length > 1 && (
        <select
          className="select"
          value={activeChapter}
          onChange={(e) => setChapterIdx(Number(e.target.value))}
        >
          {study.chapters.map((c, i) => (
            <option key={i} value={i}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {useGrid && (
        <div className="line-context">
          {study.chapters[activeChapter].name}
        </div>
      )}

      <div className="practice-modes">
        <button onClick={() => setAllLines(true)}>{t("read.allLines")}</button>
        <button
          className="primary"
          onClick={() => onPractice(chapterLineItems(study, activeChapter), false)}
        >
          {t("practice.chapter")}
        </button>
      </div>

      <div className="row">
        <button
          className="link small"
          onClick={() =>
            pauseLowWeight(
              study.id,
              activeChapter,
              100 / settings.coverageThreshold,
            )
          }
        >
          Exclude rarer than 1 in {settings.coverageThreshold}
        </button>
        <button
          className="link small"
          onClick={() => resumeAllInChapter(study.id, activeChapter)}
        >
          Resume paused
        </button>
      </div>

      <ul className="list">
        {chapterLines.map((l) => {
          const due = isDue(l.sched, now);
          const sans = l.moves.map((m) => m.san).join(" ");
          const divergeAt = divergenceMap.get(l.id) ?? 0;
          const shared = l.moves.slice(0, divergeAt).map((m) => m.san).join(" ");
          const unique = l.moves.slice(divergeAt).map((m) => m.san).join(" ");
          return (
            <li
              key={l.id}
              className={`line-row ${l.paused ? "paused" : ""}`}
            >
              <button
                className="line-open"
                onClick={() => setOpenLineId(l.id)}
                title={sans}
              >
                {shared && <span className="line-shared">{shared} </span>}
                <span className="line-unique">{unique}</span>
              </button>
              <div className="line-status">
                {l.weight !== undefined && (
                  <span
                    className="weight-tag"
                    title="Frequency in master games (2010+)"
                  >
                    {l.weight === 0
                      ? "rare"
                      : l.weight < 0.1
                        ? "<0.1%"
                        : `${l.weight.toFixed(1)}%`}
                    {l.weight > 0 && (
                      <span className="muted small">
                        {" "}· 1 in {Math.max(1, Math.round(100 / l.weight))}
                      </span>
                    )}
                  </span>
                )}
                <LevelBadge level={l.sched.level} />
                {!due && !l.paused && (
                  <span className="muted small">
                    {t("read.next", {
                      x: formatCountdown(new Date(l.sched.due)),
                    })}
                  </span>
                )}
                <button
                  className="link small"
                  title={l.paused ? "Resume" : "Pause"}
                  onClick={() => setPaused(study.id, l.id, !l.paused)}
                >
                  {l.paused ? "▶" : "⏸"}
                </button>
                {!l.paused && (
                  <button
                    className={due ? "primary small" : "again small"}
                    onClick={() =>
                      onPractice([{ studyId: study.id, line: l }], !due)
                    }
                  >
                    {due ? t("read.practice") : t("read.practiceAgain")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LineBrowser({
  study,
  line,
  settings,
  onBack,
  onPractice,
}: {
  study: Study;
  line: Line;
  settings: Settings;
  onBack: () => void;
  onPractice: (items: LineItem[], freeze: boolean) => void;
}) {
  const t = useT();
  const [ply, setPly] = useState(0);
  const [evalResult, setEvalResult] = useState<EvalResult | null | "loading" | "none">(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      else if (e.key === "ArrowRight")
        setPly((p) => Math.min(line.moves.length, p + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [line.moves.length]);

  const fen = ply === 0 ? line.moves[0].fenBefore : line.moves[ply - 1].fenAfter;

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
  const playedSans = line.moves.slice(0, ply).map((m) => m.san).join(" ");
  const comment = ply > 0 ? line.moves[ply - 1].comment : undefined;
  const due = isDue(line.sched);

  const lineStats = summarizeTimes(line.lineTimes);
  const moveStats = ply > 0 ? summarizeTimes(line.moveTimes[ply - 1] ?? []) : null;
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <div className="page drill">
      <div className="row">
        <button className="link" onClick={onBack}>
          {t("read.lines")}
        </button>
        <button
          className="link"
          onClick={() => onPractice([{ studyId: study.id, line }], !due)}
        >
          {due ? t("read.practiceArrow") : t("read.practiceAgainArrow")}
        </button>
      </div>

      <div className="line-notation">
        <button
          className={`move ${ply === 0 ? "current" : ""}`}
          onClick={() => setPly(0)}
        >
          {t("common.startingPosition")}
        </button>
        {line.moves.map((m, i) => (
          <span key={i}>
            {i % 2 === 0 && (
              <span className="moveno">{Math.floor(i / 2) + 1}.</span>
            )}
            <button
              className={`move ${ply === i + 1 ? "current" : ""}`}
              onClick={() => setPly(i + 1)}
            >
              {m.san}
            </button>
          </span>
        ))}
      </div>

      <Board
        fen={fen}
        orientation={study.orientation}
        draggable={false}
        onDrop={() => false}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
        arrows={arrows}
      />

      {comment && <p className="read-comment">{comment}</p>}

      <EnginePanel evalResult={evalResult} onAnalyze={runEval} />

      {(lineStats || moveStats) && (
        <div className="time-stats">
          {lineStats && (
            <div className="time-row">
              <span className="muted small">{t("read.lineStats", { n: lineStats.n })}</span>
              <span className="small">
                {t("read.statsAvg", {
                  avg: fmt(lineStats.avg),
                  min: fmt(lineStats.min),
                  max: fmt(lineStats.max),
                })}
              </span>
            </div>
          )}
          {moveStats && (
            <div className="time-row">
              <span className="muted small">
                {t("read.moveStats", { san: line.moves[ply - 1].san, n: moveStats.n })}
              </span>
              <span className="small">
                {t("read.statsAvg", {
                  avg: fmt(moveStats.avg),
                  min: fmt(moveStats.min),
                  max: fmt(moveStats.max),
                })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="read-controls">
        <button className="nav-btn" disabled={ply === 0} onClick={() => setPly(0)}>
          {t("read.start")}
        </button>
        <button
          className="nav-btn"
          disabled={ply === 0}
          onClick={() => setPly((p) => p - 1)}
        >
          {t("read.prev")}
        </button>
        <button
          className="nav-btn"
          disabled={ply >= line.moves.length}
          onClick={() => setPly((p) => Math.min(line.moves.length, p + 1))}
        >
          {t("read.nextBtn")}
        </button>
        <a
          className="analyze-link"
          href={lichessAnalysisUrl(playedSans, study.orientation)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("read.lichess")}
        </a>
      </div>
    </div>
  );
}
