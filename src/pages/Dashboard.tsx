import { useEffect, useState } from "react";
import { loadReviewLog, type ReviewEntry } from "../storage";
import { accuracy, currentStreak, dueCount } from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onPractice: () => void;
  onRead: () => void;
  onImport: () => void;
  onSettings: () => void;
}

// Original, copyright-free line icons (CC0).
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
  <svg className="box-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6h.1A1.6 1.6 0 0 0 8 1.1V1a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
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

  useEffect(() => {
    loadReviewLog().then(setLog);
  }, []);

  const due = dueCount(studies);
  const acc = accuracy(studies.flatMap((s) => s.cards));
  const streak = log ? currentStreak(log) : 0;

  const base = import.meta.env.BASE_URL;
  const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) =>
    e.currentTarget.remove();

  return (
    <div className="page">
      <div className="dash-header">
        <img
          className="logo logo-light"
          src={`${base}logo-light.png`}
          alt=""
          onError={hideOnError}
        />
        <img
          className="logo logo-dark"
          src={`${base}logo-dark.png`}
          alt=""
          onError={hideOnError}
        />
        <div>
          <h1 className="brand">ChessMemo</h1>
          <p className="muted small">Your opening trainer</p>
        </div>
      </div>

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
      </div>

      <div className="box-grid">
        <button className="box-card primary" onClick={onPractice}>
          {PracticeIcon}
          <span className="box-title">Practice</span>
          <span className="box-sub">
            {due > 0 ? `${due} due now` : "All caught up"}
          </span>
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
