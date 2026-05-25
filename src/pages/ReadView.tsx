import { useMemo, useState } from "react";
import { Board } from "../components/Board";
import { parsePgn, type PgnNode } from "../pgnTree";
import { lichessAnalysisUrl } from "../lichess";
import type { Settings } from "../settings";
import type { Study } from "../types";

interface Props {
  study: Study;
  settings: Settings;
  onBack: () => void;
}

export function ReadView({ study, settings, onBack }: Props) {
  const tree = useMemo(() => {
    try {
      return parsePgn(study.pgn);
    } catch {
      return null;
    }
  }, [study.pgn]);

  const [path, setPath] = useState<PgnNode[]>([]);

  if (!tree || (!study.pgn && tree.children.length === 0)) {
    return (
      <div className="page">
        <div className="row">
          <h2>{study.name}</h2>
          <button className="link" onClick={onBack}>
            Back
          </button>
        </div>
        <p className="muted">
          This opening was added before reading was supported. Re-import its PGN
          to read through the lines.
        </p>
      </div>
    );
  }

  const current = path[path.length - 1] ?? null;
  const fen = current ? current.fenAfter : tree.startFen;
  const nextMoves = current ? current.children : tree.children;
  const sans = path.map((n) => n.san);

  return (
    <div className="page drill">
      <div className="row">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <span className="muted small">{study.name}</span>
      </div>

      <div className="line-context">{sans.join(" ") || "Starting position"}</div>

      <Board
        fen={fen}
        orientation={study.orientation}
        draggable={false}
        onDrop={() => false}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
      />

      {current?.comment && <p className="read-comment">{current.comment}</p>}

      <div className="read-controls">
        <button
          className="nav-btn"
          disabled={path.length === 0}
          onClick={() => setPath((p) => p.slice(0, -1))}
        >
          ← Prev
        </button>
        <a
          className="analyze-link"
          href={lichessAnalysisUrl(sans.join(" "), study.orientation)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Lichess ↗
        </a>
      </div>

      {nextMoves.length > 0 && (
        <div className="next-moves">
          <span className="muted small">
            {nextMoves.length > 1 ? "Choose a line:" : "Continue:"}
          </span>
          <div className="move-choices">
            {nextMoves.map((m, i) => (
              <button
                key={`${m.san}-${i}`}
                className={`move-choice ${i === 0 ? "main" : ""}`}
                onClick={() => setPath((p) => [...p, m])}
              >
                {m.san}
              </button>
            ))}
          </div>
        </div>
      )}

      {nextMoves.length === 0 && (
        <p className="muted small center-text">End of this line.</p>
      )}
    </div>
  );
}
