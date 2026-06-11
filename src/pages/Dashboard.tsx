import { useEffect, useState } from "react";
import { loadReviewLog, type ReviewEntry } from "../storage";
import {
  accuracy,
  currentStreak,
  dueCount,
  forecast,
  linesDueOnDay,
  retention,
} from "../stats";
import { useT, levelName, levelInterval } from "../i18n";
import { getLevelNames } from "../srs";
import { LevelBadge } from "../components/LevelBadge";
import type { LineItem } from "../useStudies";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onPractice: () => void;
  onRead: () => void;
  onImport: () => void;
  onSettings: () => void;
  onStartLine: (items: LineItem[]) => void;
}

const PracticeIcon = (
  <svg className="box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <polyline points="21 3 21 8 16 8" />
  </svg>
);
const ReadIcon = (
  <svg className="box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5h6a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H3z" />
    <path d="M21 5h-6a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H21z" />
  </svg>
);
const ImportIcon = (
  <svg className="box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12" />
    <polyline points="8 11 12 15 16 11" />
    <path d="M5 21h14" />
  </svg>
);
const SettingsIcon = (
  <svg className="box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1.5l1.6 2.7 3.1-.5.6 3.1 2.7 1.6-1.4 2.8 1.4 2.8-2.7 1.6-.6 3.1-3.1-.5L12 22.5l-1.6-2.7-3.1.5-.6-3.1L4 15.6l1.4-2.8L4 10l2.7-1.6.6-3.1 3.1.5z" />
  </svg>
);

export function Dashboard({
  studies,
  onPractice,
  onRead,
  onImport,
  onSettings,
  onStartLine,
}: Props) {
  const t = useT();
  const [log, setLog] = useState<ReviewEntry[] | null>(null);
  const [scope, setScope] = useState<string>("all");
  const [selDay, setSelDay] = useState<number | null>(null);

  useEffect(() => {
    loadReviewLog().then(setLog);
  }, []);

  const filtered = scope === "all" ? studies : studies.filter((s) => s.id === scope);
  const lines = filtered.flatMap((s) => s.lines);

  const due = dueCount(filtered);
  const acc = accuracy(lines);
  const streak = log ? currentStreak(log) : 0;
  const r = retention(lines);
  const hasLines = lines.length > 0;
  const days = forecast(filtered);

  const base = import.meta.env.BASE_URL;
  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) =>
    e.currentTarget.remove();

  return (
    <div className="page">
      <div className="dash-header">
        <img className="logo logo-light" src={`${base}logo-light.png`} alt="" onError={hideOnError} />
        <img className="logo logo-dark" src={`${base}logo-dark.png`} alt="" onError={hideOnError} />
        <div>
          <h1 className="brand">ChessMemo</h1>
          <p className="muted small">{t("dash.subtitle")}</p>
        </div>
      </div>

      {studies.length > 1 && (
        <select className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">{t("common.allRepertoires")}</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{due}</span>
          <span className="muted small">{t("dash.linesToReview")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{acc === null ? "—" : `${acc}%`}</span>
          <span className="muted small">{t("dash.accuracy")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{streak}🔥</span>
          <span className="muted small">{t("dash.dayStreak")}</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{r.retainedPct}%</span>
          <span className="muted small">{t("dash.retained")}</span>
        </div>
      </div>

      {hasLines && (
        <section>
          <h3 className="section-label">{t("dash.levels")}</h3>
          <div className="level-list">
            {getLevelNames().map((_, i) => (
              <div key={i} className="level-item">
                <span className={`level-dot lvl-${i}`} />
                <span className="level-name">
                  {levelName(t, i)}
                  {i > 0 && (
                    <span className="muted small"> ({levelInterval(t, i)})</span>
                  )}
                </span>
                <span className="level-count">{r.levels[i]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasLines && (
        <section>
          <h3 className="section-label">{t("dash.calendar")}</h3>
          <div className="forecast">
            {days.map((d, i) => (
              <button
                key={i}
                className={`fc-cell ${d.today ? "today" : ""} ${d.count === 0 ? "empty" : ""} ${selDay === i ? "selected" : ""}`}
                onClick={() => setSelDay(selDay === i ? null : i)}
              >
                <span className="fc-day">{d.today ? t("dash.today") : d.label}</span>
                <span className="fc-date">{d.date}</span>
                <span className="fc-count">{d.count}</span>
              </button>
            ))}
          </div>

          {selDay !== null &&
            (() => {
              const refs = linesDueOnDay(filtered, selDay);
              if (refs.length === 0) {
                return <p className="muted small">{t("box.allCaught")}</p>;
              }
              return (
                <div className="day-lines">
                  <button
                    className="primary small"
                    onClick={() =>
                      onStartLine(
                        refs.map((r) => ({ studyId: r.studyId, line: r.line })),
                      )
                    }
                  >
                    {t("practice.linesDue", { n: refs.length })}
                  </button>
                  <ul className="list">
                    {refs.map((ref) => (
                      <li key={ref.line.id} className="line-row">
                        <span className="line-open" title={ref.line.moves.map((m) => m.san).join(" ")}>
                          {ref.line.moves.map((m) => m.san).join(" ")}
                        </span>
                        <LevelBadge level={ref.line.sched.level} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
        </section>
      )}

      <div className="box-grid">
        <button className="box-card primary" onClick={onPractice}>
          {PracticeIcon}
          <span className="box-title">{t("box.practice")}</span>
          <span className="box-sub">
            {due > 0 ? t("box.practiceDue", { n: due }) : t("box.allCaught")}
          </span>
        </button>
        <button className="box-card" onClick={onRead}>
          {ReadIcon}
          <span className="box-title">{t("box.read")}</span>
          <span className="box-sub">{t("box.readSub")}</span>
        </button>
        <button className="box-card" onClick={onImport}>
          {ImportIcon}
          <span className="box-title">{t("box.import")}</span>
          <span className="box-sub">{t("box.importSub")}</span>
        </button>
        <button className="box-card" onClick={onSettings}>
          {SettingsIcon}
          <span className="box-title">{t("box.settings")}</span>
          <span className="box-sub">{t("box.settingsSub")}</span>
        </button>
      </div>
    </div>
  );
}
