import { useState } from "react";
import { Board } from "../components/Board";
import { lichessAnalysisUrl } from "../lichess";
import { isDue } from "../srs";
import { formatCountdown } from "../stats";
import { type LineItem } from "../useStudies";
import type { Line, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  study: Study;
  settings: Settings;
  onBack: () => void;
  onPractice: (items: LineItem[], freeze: boolean) => void;
}

export function ReadView({ study, settings, onBack, onPractice }: Props) {
  const [chapterIdx, setChapterIdx] = useState(0);
  const [openLineId, setOpenLineId] = useState<string | null>(null);

  const chapterLines = study.lines.filter((l) => l.chapterIdx === chapterIdx);
  const openLine = study.lines.find((l) => l.id === openLineId) ?? null;

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

  const now = new Date();

  return (
    <div className="page">
      <div className="row">
        <button className="link" onClick={onBack}>
          ← Back
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

      <ul className="list">
        {chapterLines.map((l) => {
          const due = isDue(l.fsrs, now);
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
                {due ? (
                  <button
                    className="primary small"
                    onClick={() => onPractice([{ studyId: study.id, line: l }], false)}
                  >
                    Practice
                  </button>
                ) : (
                  <>
                    <span className="muted small">
                      next {formatCountdown(new Date(l.fsrs.due), now)}
                    </span>
                    <button
                      className="link small"
                      onClick={() =>
                        onPractice([{ studyId: study.id, line: l }], true)
                      }
                    >
                      Practice again
                    </button>
                  </>
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
  const [ply, setPly] = useState(0); // 0 = start, n = after n moves
  const fen = ply === 0 ? line.moves[0].fenBefore : line.moves[ply - 1].fenAfter;
  const playedSans = line.moves.slice(0, ply).map((m) => m.san).join(" ");
  const comment = ply > 0 ? line.moves[ply - 1].comment : undefined;
  const due = isDue(line.fsrs);

  return (
    <div className="page drill">
      <div className="row">
        <button className="link" onClick={onBack}>
          ← Lines
        </button>
        <button
          className="link"
          onClick={() => onPractice([{ studyId: study.id, line }], !due)}
        >
          {due ? "Practice ▶" : "Practice again ▶"}
        </button>
      </div>

      <div className="line-context">{playedSans || "Starting position"}</div>

      <Board
        fen={fen}
        orientation={study.orientation}
        draggable={false}
        onDrop={() => false}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
      />

      {comment && <p className="read-comment">{comment}</p>}

      <div className="read-controls">
        <button className="nav-btn" disabled={ply === 0} onClick={() => setPly(0)}>
          ⏮ Start
        </button>
        <button
          className="nav-btn"
          disabled={ply === 0}
          onClick={() => setPly((p) => p - 1)}
        >
          ← Prev
        </button>
        <button
          className="nav-btn"
          disabled={ply >= line.moves.length}
          onClick={() => setPly((p) => Math.min(line.moves.length, p + 1))}
        >
          Next →
        </button>
        <a
          className="analyze-link"
          href={lichessAnalysisUrl(playedSans, study.orientation)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lichess ↗
        </a>
      </div>
    </div>
  );
}
