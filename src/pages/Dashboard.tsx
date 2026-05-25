import { useEffect, useState } from "react";
import { loadReviewLog, type ReviewEntry } from "../storage";
import { accuracy, currentStreak, dueCount } from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  onPractice: () => void;
  onRead: () => void;
  onImport: () => void;
}

export function Dashboard({ studies, onPractice, onRead, onImport }: Props) {
  const [log, setLog] = useState<ReviewEntry[] | null>(null);

  useEffect(() => {
    loadReviewLog().then(setLog);
  }, []);

  const due = dueCount(studies);
  const acc = accuracy(studies.flatMap((s) => s.cards));
  const streak = log ? currentStreak(log) : 0;

  return (
    <div className="page">
      <h1 className="brand">ChessMemo</h1>
      <p className="muted">Your opening trainer</p>

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

      <div className="dash-actions">
        <button className="primary big" onClick={onPractice}>
          Practice{due > 0 ? ` (${due})` : ""}
        </button>
        <button className="big" onClick={onRead}>
          Read
        </button>
        <button className="big" onClick={onImport}>
          Import PGN
        </button>
      </div>
    </div>
  );
}
