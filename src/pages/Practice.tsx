import { useState } from "react";
import { dueCount, retention } from "../stats";
import { isDue } from "../srs";
import { nowSrs } from "../clock";
import { ChapterGrid } from "../components/ChapterGrid";
import { chapterDivergence } from "../divergence";
import type { Settings } from "../settings";
import { useT, levelName } from "../i18n";
import { LevelBadge } from "../components/LevelBadge";
import {
  buildPositions,
  chapterLineItems,
  dueLines,
  lineItemsOf,
  type LineItem,
  type PositionItem,
} from "../useStudies";
import type { Line, Study } from "../types";

interface Props {
  studies: Study[];
  settings: Settings;
  onStartLine: (items: LineItem[], freeze?: boolean) => void;
  onStartPosition: (positions: PositionItem[]) => void;
  onImport: () => void;
  pauseLowWeight: (studyId: string, chapterIdx: number, threshold: number) => void;
  resumeAllInChapter: (studyId: string, chapterIdx: number) => void;
}

function dueItemsOf(items: LineItem[]): LineItem[] {
  const now = nowSrs();
  return items.filter((it) => isDue(it.line.sched, now));
}

export function Practice({
  studies,
  settings,
  onStartLine,
  onStartPosition,
  onImport,
  pauseLowWeight,
  resumeAllInChapter,
}: Props) {
  const t = useT();
  const [selId, setSelId] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState<number | null>(null);

  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>{t("practice.nothing")}</h2>
        <p className="muted">{t("practice.nothingSub")}</p>
        <button className="primary big" onClick={onImport}>
          {t("box.import")}
        </button>
      </div>
    );
  }

  const side = (s: Study) =>
    s.orientation === "white" ? t("common.white") : t("common.black");

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

  function lineButtons(items: LineItem[]) {
    const due = dueItemsOf(items);
    return (
      <div className="practice-modes">
        {due.length > 0 ? (
          <button className="primary" onClick={() => onStartLine(due, false)}>
            {t("practice.linesDue", { n: due.length })}
          </button>
        ) : (
          <button className="again" onClick={() => onStartLine(items, true)}>
            {t("practice.againLines")}
          </button>
        )}
        <button onClick={() => onStartPosition(buildPositions(selStudy ?? studies[0], items))}>
          {t("practice.positions")}
        </button>
      </div>
    );
  }

  const selStudy = studies.find((s) => s.id === selId) ?? null;

  // ---- Line-selection view for one opening ----
  if (selStudy) {
    const useGrid =
      settings.chapterView === "grid" && selStudy.chapters.length > 1;
    const showGrid = useGrid && chapterIdx === null;
    const activeChapter = chapterIdx ?? 0;
    const chLines = selStudy.lines.filter(
      (l) => l.chapterIdx === activeChapter,
    );
    const chItems = chapterLineItems(selStudy, activeChapter);
    const divergenceMap = chapterDivergence(selStudy.lines, activeChapter);
    const now = nowSrs();

    if (showGrid) {
      return (
        <div className="page">
          <div className="row">
            <button
              className="link"
              onClick={() => {
                setSelId(null);
                setChapterIdx(null);
              }}
            >
              {t("common.back")}
            </button>
            <span className="muted small">{selStudy.name}</span>
          </div>
          <ChapterGrid study={selStudy} onPick={(i) => setChapterIdx(i)} />
        </div>
      );
    }

    return (
      <div className="page">
        <div className="row">
          <button
            className="link"
            onClick={() => {
              if (useGrid) {
                setChapterIdx(null);
              } else {
                setSelId(null);
                setChapterIdx(null);
              }
            }}
          >
            {t("common.back")}
          </button>
          <span className="muted small">{selStudy.name}</span>
        </div>

        {!useGrid && selStudy.chapters.length > 1 && (
          <select
            className="select"
            value={activeChapter}
            onChange={(e) => setChapterIdx(Number(e.target.value))}
          >
            {selStudy.chapters.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {useGrid && (
          <div className="line-context">
            {selStudy.chapters[activeChapter].name}
          </div>
        )}

        {lineButtons(chItems)}

        <div className="row">
          <button
            className="link small"
            onClick={() =>
              pauseLowWeight(
                selStudy.id,
                activeChapter,
                100 / settings.coverageThreshold,
              )
            }
          >
            Exclude rarer than 1 in {settings.coverageThreshold}
          </button>
          <button
            className="link small"
            onClick={() => resumeAllInChapter(selStudy.id, activeChapter)}
          >
            Resume paused
          </button>
        </div>

        <ul className="list">
          {chLines.map((l) => {
            const due = isDue(l.sched, now);
            const sans = l.moves.map((m) => m.san).join(" ");
            const divergeAt = divergenceMap.get(l.id) ?? 0;
            const shared = l.moves
              .slice(0, divergeAt)
              .map((m) => m.san)
              .join(" ");
            const unique = l.moves
              .slice(divergeAt)
              .map((m) => m.san)
              .join(" ");
            return (
              <li
                key={l.id}
                className={`line-row ${l.paused ? "paused" : ""}`}
              >
                <span className="line-open" title={sans}>
                  {shared && (
                    <span className="line-shared">{shared} </span>
                  )}
                  <span className="line-unique">{unique}</span>
                </span>
                <div className="line-status">
                  {l.weight !== undefined && l.weight > 0 && (
                    <span
                      className="weight-tag"
                      title="Frequency in master games (2010+)"
                    >
                      {l.weight < 0.1 ? "<0.1%" : `${l.weight.toFixed(1)}%`}
                      <span className="muted small">
                        {" "}· 1 in {Math.max(1, Math.round(100 / l.weight))}
                      </span>
                    </span>
                  )}
                  <LevelBadge level={l.sched.level} />
                  {!l.paused && (
                    <button
                      className={due ? "primary small" : "again small"}
                      onClick={() =>
                        onStartLine([{ studyId: selStudy.id, line: l }], !due)
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

  // ---- Overview ----
  const totalDue = dueCount(studies);
  return (
    <div className="page">
      <h2>{t("practice.title")}</h2>

      <button
        className="primary big"
        disabled={totalDue === 0}
        onClick={() => onStartLine(dueLines(studies), false)}
      >
        {totalDue === 0
          ? t("practice.allCaught")
          : t("practice.reviewAllDue", { n: totalDue })}
      </button>

      {studies.map((s) => {
        const items = lineItemsOf(s);
        const due = dueItemsOf(items);
        return (
          <section key={s.id} className="study-card">
            <div className="list-title">{s.name}</div>
            <div className="muted small">
              {t("practice.linesCount", { n: s.lines.length, side: side(s) })}
            </div>
            <LevelBar lines={s.lines} />

            <div className="practice-modes">
              {due.length > 0 ? (
                <button className="primary" onClick={() => onStartLine(due, false)}>
                  {t("practice.linesDue", { n: due.length })}
                </button>
              ) : (
                <button className="again" onClick={() => onStartLine(items, true)}>
                  {t("practice.againLines")}
                </button>
              )}
              <button onClick={() => onStartPosition(buildPositions(s, items))}>
                {t("practice.positions")}
              </button>
            </div>
            <div className="row">
              <button
                className="link"
                onClick={() => {
                  setSelId(s.id);
                  setChapterIdx(
                    settings.chapterView === "grid" && s.chapters.length > 1
                      ? null
                      : 0,
                  );
                }}
              >
                {t("practice.chooseLines")} →
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
