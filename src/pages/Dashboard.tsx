import { useEffect, useState } from "react";
import { loadReviewLog, type ReviewEntry } from "../storage";
import { accuracy, currentStreak, dueCount, forecast, retention } from "../stats";
import { LEVEL_NAMES } from "../srs";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onPractice: () => void;
  onRead: () => void;
  onImport: () => void;
  onSettings: () => void;
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
}: Props) {
  const [log, setLog] = useState<ReviewEntry[] | null>(null);
  const [scope, setScope] = useState<string>("all");

  useEffect(() => {
    loadReviewLog().then(setLog);
  }, []);

  const filtered =
    scope === "all" ? studies : studies.filter((s) => s.id === scope);
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
          <p className="muted small">Your opening trainer</p>
        </div>
      </div>

      {studies.length > 1 && (
        <select
          className="select"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="all">All repertoires</option>
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
          <span className="muted small">lines to review</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{acc === null ? "—" : `${acc}%`}</span>
          <span className="muted small">accuracy</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{streak}🔥</span>
          <span className="muted small">day streak</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{r.retainedPct}%</span>
          <span className="muted small">retained</span>
        </div>
      </div>

      {hasLines && (
        <section>
          <h3 className="section-label">Memorization levels</h3>
          <div className="level-list">
            {LEVEL_NAMES.map((name, i) => (
              <div key={i} className="level-item">
                <span className={`level-dot lvl-${i}`} />
                <span className="level-name">{name}</span>
                <span className="level-count">{r.levels[i]}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasLines && (
        <section>
          <h3 className="section-label">Review calendar</h3>
          <div className="forecast">
            {days.map((d, i) => (
              <div
                key={i}
                className={`fc-cell ${d.today ? "today" : ""} ${d.count === 0 ? "empty" : ""}`}
              >
                <span className="fc-day">{d.label}</span>
                <span className="fc-date">{d.date}</span>
                <span className="fc-count">{d.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="box-grid">
        <button className="box-card primary" onClick={onPractice}>
          {PracticeIcon}
          <span className="box-title">Practice</span>
          <span className="box-sub">{due > 0 ? `${due} due now` : "All caught up"}</span>
        </button>
        <button className="box-card" onClick={onRead}>
          {ReadIcon}
          <span className="box-title">Read</span>
          <span className="box-sub">Browse your lines</span>
        </button>
        <button className="box-card" onClick={onImport}>
          {ImportIcon}
          <span className="box-title">Import PGN</span>
          <span className="box-sub">Add or merge a study</span>
        </button>
        <button className="box-card" onClick={onSettings}>
          {SettingsIcon}
          <span className="box-title">Settings</span>
          <span className="box-sub">Theme &amp; board</span>
        </button>
      </div>
    </div>
  );
}
