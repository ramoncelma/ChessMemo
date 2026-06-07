import { useEffect, useState } from "react";
import { dueCount, retention } from "../stats";
import { isDue } from "../srs";
import { nowSrs } from "../clock";
import { ChapterGrid } from "../components/ChapterGrid";
import { chapterDivergence } from "../divergence";
import {
  getWeightStatus,
  subscribeWeightStatus,
  type WeightStatus,
} from "../weightsScheduler";
import {
  ensureLichessCacheLoaded,
  ensureMastersCacheLoaded,
  traceLineWeight,
  type WeightTraceStep,
} from "../weights";
import {
  chapterCoverage,
  studyCoverage,
  formatCoverage,
  formatOneIn,
} from "../coverage";
import type { Settings } from "../settings";
import { useT, levelName } from "../i18n";
import { LevelBadge } from "../components/LevelBadge";
import { WeightTags } from "../components/WeightTags";
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
  pauseLowWeight: (
    studyId: string,
    chapterIdx: number,
    threshold: number,
    source?: "gm" | "lichess",
  ) => void;
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
  const [trace, setTrace] = useState<
    { lineId: string; source: "gm" | "lichess" } | null
  >(null);
  const [, forceRender] = useState(0);
  useEffect(() => subscribeWeightStatus(() => forceRender((n) => n + 1)), []);

  function statusFor(studyId: string): WeightStatus | null {
    return getWeightStatus(studyId);
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
    const useGrid =
      settings.chapterView === "grid" && selStudy.chapters.length > 1;
    const showGrid = useGrid && chapterIdx === null;
    const activeChapter = chapterIdx ?? 0;
    const chLines = selStudy.lines
      .filter((l) => l.chapterIdx === activeChapter)
      .slice()
      .sort((a, b) => {
        const max = Math.max(a.moves.length, b.moves.length);
        for (let i = 0; i < max; i++) {
          const as = a.moves[i]?.san ?? "";
          const bs = b.moves[i]?.san ?? "";
          if (as !== bs) return as < bs ? -1 : 1;
        }
        return a.moves.length - b.moves.length;
      });
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

        {(() => {
          const st = statusFor(selStudy.id);
          if (st && st.running) {
            return (
              <p className="muted small">
                Computing line weights
                {st.total > 0 ? ` · ${st.done}/${st.total}` : "…"}
                {st.stats &&
                  (st.stats.fetched > 0 ||
                    st.stats.cached > 0 ||
                    st.stats.failed > 0) && (
                    <>
                      {" "}
                      ({st.stats.fetched} fetched, {st.stats.cached} cached
                      {st.stats.failed > 0 && `, ${st.stats.failed} failed`})
                    </>
                  )}
              </p>
            );
          }
          const noneWeighted = selStudy.lines
            .filter((l) => l.chapterIdx === activeChapter)
            .every((l) => l.weight === undefined);
          if (noneWeighted) {
            return (
              <p className="muted small">
                Weights not yet computed for this chapter.
              </p>
            );
          }
          return null;
        })()}

        <div className="row">
          <button
            className="link small"
            disabled={statusFor(selStudy.id)?.running ?? false}
            onClick={() =>
              pauseLowWeight(
                selStudy.id,
                activeChapter,
                100 / settings.coverageThreshold,
                settings.weightRankingSource,
              )
            }
          >
            Exclude rarer than 1 in {settings.coverageThreshold} (
            {settings.weightRankingSource === "gm" ? "GM" : "Lichess"})
          </button>
          <button
            className="link small"
            onClick={() => resumeAllInChapter(selStudy.id, activeChapter)}
          >
            Resume paused
          </button>
        </div>

        {(() => {
          const cov = chapterCoverage(selStudy, activeChapter);
          if (cov === 0) return null;
          const oneIn = formatOneIn(cov);
          return (
            <p className="muted small">
              Chapter coverage:{" "}
              <strong>{formatCoverage(cov)}</strong>
              {oneIn && <> · {oneIn} master games</>}
            </p>
          );
        })()}

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
            const showTrace = trace?.lineId === l.id;
            return (
              <li
                key={l.id}
                className={`line-row ${l.paused ? "paused" : ""} ${showTrace ? "expanded" : ""}`}
              >
                <span className="line-open" title={sans}>
                  {shared && (
                    <span className="line-shared">{shared} </span>
                  )}
                  <span className="line-unique">{unique}</span>
                </span>
                <div className="line-status">
                  <WeightTags
                    weight={l.weight}
                    weightLichess={l.weightLichess}
                    gmWdb={l.gmWdb}
                    lichessWdb={l.lichessWdb}
                    activeSource={showTrace ? trace?.source ?? null : null}
                    onClick={(source) =>
                      setTrace(
                        showTrace && trace?.source === source
                          ? null
                          : { lineId: l.id, source },
                      )
                    }
                  />
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
                {showTrace && trace && (
                  <WeightTrace
                    study={selStudy}
                    lineId={l.id}
                    source={trace.source}
                    weight={
                      trace.source === "gm" ? l.weight : l.weightLichess
                    }
                    running={statusFor(selStudy.id)?.running ?? false}
                  />
                )}
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
        const wstat = statusFor(s.id);
        return (
          <section key={s.id} className="study-card">
            <div className="list-title">{s.name}</div>
            <div className="muted small">
              {t("practice.linesCount", { n: s.lines.length, side: side(s) })}
            </div>
            {wstat && wstat.running && (
              <div className="muted small">
                Computing weights
                {wstat.total > 0 ? ` · ${wstat.done}/${wstat.total}` : "…"}
                {wstat.stats &&
                  (wstat.stats.fetched > 0 ||
                    wstat.stats.cached > 0 ||
                    wstat.stats.failed > 0) && (
                    <>
                      {" "}
                      ({wstat.stats.fetched} fetched, {wstat.stats.cached}{" "}
                      cached
                      {wstat.stats.failed > 0 &&
                        `, ${wstat.stats.failed} failed`}
                      )
                    </>
                  )}
              </div>
            )}
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

function WeightTrace({
  study,
  lineId,
  source,
  weight,
  running,
}: {
  study: Study;
  lineId: string;
  source: "gm" | "lichess";
  weight: number | undefined;
  running: boolean;
}) {
  const [steps, setSteps] = useState<WeightTraceStep[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load =
      source === "gm" ? ensureMastersCacheLoaded() : ensureLichessCacheLoaded();
    void load.then(() => {
      if (!cancelled) setSteps(traceLineWeight(study, lineId, source));
    });
    return () => {
      cancelled = true;
    };
  }, [study, lineId, running, source]);

  const srcLabel = source === "gm" ? "GM (Masters)" : "Lichess online";
  if (steps === null) {
    return (
      <div className="weight-trace">
        <p className="muted small">Loading cached {srcLabel} data…</p>
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div className="weight-trace">
        <p className="muted small">
          No opponent moves to analyse. (User-only line?)
        </p>
      </div>
    );
  }
  const last = steps[steps.length - 1];
  return (
    <div className="weight-trace">
      <div className="muted small">
        <strong>{srcLabel}</strong> · stored weight:{" "}
        {weight === undefined ? "—" : `${weight.toFixed(4)}%`}
        {running && <> · recomputing now — reopen to refresh</>}
      </div>
      <table className="weight-trace-table">
        <thead>
          <tr>
            <th title="0-indexed position in the line (white move 1 = ply 0)">
              Ply
            </th>
            <th title="The opponent's move in this line at this ply">
              Opp. SAN
            </th>
            <th title="ok = a real response; no-cache = not fetched; no-data-fetched-empty = explorer returned 0 games; san-not-in-counts = the move isn't in the top 50 explorer replies for this position">
              Status
            </th>
            <th title={`How many ${srcLabel} games played this exact move from this position`}>
              Count
            </th>
            <th title={`Total ${srcLabel} games reaching this position (used as denominator)`}>
              Total
            </th>
            <th title="Count / Total — probability of this move given the position">
              P(move)
            </th>
            <th title="Product of P(move) for every opponent move so far — probability you reach this position with the line followed exactly">
              Cumulative
            </th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} className={s.status === "ok" ? "" : "trace-broken"}>
              <td>{s.ply}</td>
              <td>{s.san}</td>
              <td>{s.status}</td>
              <td>{s.count ?? "—"}</td>
              <td>{s.total ?? "—"}</td>
              <td>
                {s.conditional !== undefined
                  ? s.conditional.toFixed(4)
                  : "—"}
              </td>
              <td>
                {s.cumulative !== undefined
                  ? (s.cumulative * 100).toFixed(4) + "%"
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {last.status !== "ok" && last.status !== "no-cache" && (
        <p className="muted small">
          Chain broke at ply {last.ply} ({last.san}). The stored weight
          reflects the prefix probability up to this point.
        </p>
      )}
      {last.status === "no-cache" && running && (
        <p className="muted small">
          A recompute is running right now and hasn't reached this position
          yet. Reopen the inspector once it finishes.
        </p>
      )}
      {last.status === "no-cache" && !running && (
        <p className="muted small">
          That position isn't in the local {srcLabel} cache (cleared, or
          never fetched). The stored weight {weight !== undefined ? `(${weight.toFixed(4)}%) ` : ""}
          is the value from an earlier compute. Use Settings →{" "}
          {source === "gm"
            ? '"Refresh GM weights"'
            : '"Refresh Lichess weights"'}{" "}
          to re-pull.
        </p>
      )}
    </div>
  );
}
