import { useState } from "react";
import { dueCount, retention } from "../stats";
import { isDue } from "../srs";
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
import { computeStudyWeights } from "../weights";
import type { Line, Study } from "../types";

interface Props {
  studies: Study[];
  onStartLine: (items: LineItem[], freeze?: boolean) => void;
  onStartPosition: (positions: PositionItem[]) => void;
  onImport: () => void;
  setLineWeights: (studyId: string, weights: Map<string, number>) => void;
  pauseLowWeight: (studyId: string, chapterIdx: number, threshold: number) => void;
  resumeAllInChapter: (studyId: string, chapterIdx: number) => void;
}

function dueItemsOf(items: LineItem[]): LineItem[] {
  const now = Date.now();
  return items.filter((it) => isDue(it.line.sched, now));
}

export function Practice({
  studies,
  onStartLine,
  onStartPosition,
  onImport,
  setLineWeights,
  pauseLowWeight,
  resumeAllInChapter,
}: Props) {
  const t = useT();
  const [selId, setSelId] = useState<string | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [weighing, setWeighing] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function computeWeights(study: Study) {
    setWeighing(study.id);
    setProgress({ done: 0, total: 0 });
    const weights = await computeStudyWeights(study, (done, total) =>
      setProgress({ done, total }),
    );
    setLineWeights(study.id, weights);
    setWeighing(null);
    setProgress(null);
  }

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
    const chLines = selStudy.lines.filter((l) => l.chapterIdx === chapterIdx);
    const chItems = chapterLineItems(selStudy, chapterIdx);
    const now = Date.now();
    return (
      <div className="page">
        <div className="row">
          <button className="link" onClick={() => setSelId(null)}>
            {t("common.back")}
          </button>
          <span className="muted small">{selStudy.name}</span>
        </div>

        {selStudy.chapters.length > 1 && (
          <select
            className="select"
            value={chapterIdx}
            onChange={(e) => setChapterIdx(Number(e.target.value))}
          >
            {selStudy.chapters.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        )}

        {lineButtons(chItems)}

        <div className="row">
          <button
            className="link small"
            onClick={() => pauseLowWeight(selStudy.id, chapterIdx, 5)}
          >
            Exclude lines &lt; 5%
          </button>
          <button
            className="link small"
            onClick={() => resumeAllInChapter(selStudy.id, chapterIdx)}
          >
            Resume paused
          </button>
        </div>

        <ul className="list">
          {chLines.map((l) => {
            const due = isDue(l.sched, now);
            const sans = l.moves.map((m) => m.san).join(" ");
            return (
              <li
                key={l.id}
                className={`line-row ${l.paused ? "paused" : ""}`}
              >
                <span className="line-open" title={sans}>
                  {sans}
                </span>
                <div className="line-status">
                  {l.weight !== undefined && (
                    <span className="weight-tag" title="Master frequency">
                      {l.weight.toFixed(0)}%
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
                  setChapterIdx(0);
                }}
              >
                {t("practice.chooseLines")} →
              </button>
              <button
                className="link small"
                disabled={weighing === s.id}
                onClick={() => computeWeights(s)}
              >
                {weighing === s.id && progress
                  ? `Weighing… ${progress.done}/${progress.total}`
                  : "Compute weights"}
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
