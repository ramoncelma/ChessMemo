import { useEffect, useState } from "react";
import { loadReviewLog, type ReviewEntry } from "../storage";
import {
  accuracy,
  activity,
  currentStreak,
  dueCount,
  formatCountdown,
  nextReviewAt,
  totalReviews,
  weakSpots,
} from "../stats";
import type { Study } from "../types";

interface Props {
  studies: Study[];
}

export function Stats({ studies }: Props) {
  const [log, setLog] = useState<ReviewEntry[] | null>(null);

  useEffect(() => {
    loadReviewLog().then(setLog);
  }, []);

  const allCards = studies.flatMap((s) => s.cards);
  const due = dueCount(studies);
  const next = nextReviewAt(studies);
  const acc = accuracy(allCards);
  const spots = weakSpots(studies);
  const streak = log ? currentStreak(log) : 0;
  const reviews = log ? totalReviews(log) : 0;
  const days = log ? activity(log) : [];
  const maxDay = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="page">
      <h2>Progress</h2>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-value">{due}</span>
          <span className="muted small">due now</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {due === 0 && next ? formatCountdown(next) : "—"}
          </span>
          <span className="muted small">next review</span>
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

      <section>
        <h3 className="section-label">Last 7 days · {reviews} total</h3>
        <div className="activity">
          {days.map((d, i) => (
            <div className="activity-col" key={i}>
              <div className="activity-bar-wrap">
                <div
                  className="activity-bar"
                  style={{ height: `${(d.count / maxDay) * 100}%` }}
                />
              </div>
              <span className="muted small">{d.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-label">Where you slip up</h3>
        {spots.length === 0 ? (
          <p className="muted small">
            No weak spots yet — keep reviewing and they'll show up here.
          </p>
        ) : (
          <ul className="list">
            {spots.map((w) => (
              <li key={w.card.id} className="list-item">
                <div>
                  <div className="list-title">{w.card.answerSan}</div>
                  <div className="muted small">
                    {w.studyName} · {w.card.line || "start"}
                  </div>
                </div>
                <span className="miss-tag">
                  {Math.round(w.rate * 100)}% missed
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
