import { useState } from "react";
import { Board } from "../components/Board";
import { lichessAnalysisUrl } from "../lichess";
import { isDue } from "../srs";
import { formatCountdown, summarizeTimes } from "../stats";
import { useT } from "../i18n";
import { LevelBadge } from "../components/LevelBadge";
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
}

export function ReadView({
  study,
  settings,
  initialLineId,
  onBack,
  onPractice,
}: Props) {
  const t = useT();
  const initialChapter = initialLineId
    ? (study.lines.find((l) => l.id === initialLineId)?.chapterIdx ?? 0)
    : 0;
  const [chapterIdx, setChapterIdx] = useState(initialChapter);
  const [openLineId, setOpenLineId] = useState<string | null>(initialLineId ?? null);
  const [allLines, setAllLines] = useState(false);

  const chapterLines = study.lines.filter((l) => l.chapterIdx === chapterIdx);
  const openLine = study.lines.find((l) => l.id === openLineId) ?? null;

  if (allLines) {
    return (
      <ChapterReader
        study={study}
        chapterIdx={chapterIdx}
        settings={settings}
        onBack={() => setAllLines(false)}
        onPractice={onPractice}
      />
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

  const now = Date.now();

  return (
    <div className="page">
      <div className="row">
        <button className="link" onClick={onBack}>
          {t("common.back")}
        </button>
        <span className="muted small">{study.name}</span>
      </div>

      {study.chapters.length > 1 && (
        <select
          className="select"
          value={chapterIdx}
          onChange={(e) => setChapterIdx(Number(e.target.value))}
        >
          {study.chapters.map((c, i) => (
            <option key={i} value={i}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      <div className="practice-modes">
        <button onClick={() => setAllLines(true)}>{t("read.allLines")}</button>
        <button
          className="primary"
          onClick={() => onPractice(chapterLineItems(study, chapterIdx), false)}
        >
          {t("practice.chapter")}
        </button>
      </div>

      <ul className="list">
        {chapterLines.map((l) => {
          const due = isDue(l.sched, now);
          const sans = l.moves.map((m) => m.san).join(" ");
          return (
            <li key={l.id} className="line-row">
              <button
                className="line-open"
                onClick={() => setOpenLineId(l.id)}
                title={sans}
              >
                {sans}
              </button>
              <div className="line-status">
                <LevelBadge level={l.sched.level} />
                {!due && (
                  <span className="muted small">
                    {t("read.next", {
                      x: formatCountdown(new Date(l.sched.due)),
                    })}
                  </span>
                )}
                <button
                  className={due ? "primary small" : "again small"}
                  onClick={() => onPractice([{ studyId: study.id, line: l }], !due)}
                >
                  {due ? t("read.practice") : t("read.practiceAgain")}
                </button>
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
  const fen = ply === 0 ? line.moves[0].fenBefore : line.moves[ply - 1].fenAfter;
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
      />

      {comment && <p className="read-comment">{comment}</p>}

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
