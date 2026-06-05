import { useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import type { Settings } from "../settings";
import type { Orientation } from "../types";
import type { RealGame } from "../games";

export interface DeviationRef {
  studyId: string;
  studyName: string;
  orientation: Orientation;
  game: RealGame;
  fullmove: number;
  played: string;
  expected: string[];
}

interface Props {
  deviations: DeviationRef[];
  settings: Settings;
  onBack: () => void;
}

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function norm(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

// Replay the game up to the ply BEFORE the user's deviation, returning the
// resulting FEN. Returns null if the position can't be reconstructed.
function setupPosition(
  game: RealGame,
  fullmove: number,
  orientation: Orientation,
): string | null {
  const userPly = (fullmove - 1) * 2 + (orientation === "black" ? 1 : 0);
  const ch = new Chess();
  for (let p = 0; p < userPly; p++) {
    const m = game.moves[p];
    if (!m) return null;
    try {
      ch.move(m);
    } catch {
      return null;
    }
  }
  return ch.fen();
}

export function MistakesMode({ deviations, settings, onBack }: Props) {
  const order = useMemo(() => shuffled(deviations), [deviations]);
  const [idx, setIdx] = useState(0);
  const [verdict, setVerdict] = useState<"idle" | "correct" | "wrong">("idle");
  const [played, setPlayed] = useState<string | null>(null);

  if (order.length === 0) {
    return (
      <div className="page center">
        <h2>Nothing to fix</h2>
        <p className="muted">
          No deviations across your repertoires. Fetch some games first.
        </p>
        <button className="primary big" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }

  if (idx >= order.length) {
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">✓</div>
          <h2>Done</h2>
          <p className="muted">You worked through every deviation.</p>
          <button className="primary big" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const dev = order[idx];
  const fen = setupPosition(dev.game, dev.fullmove, dev.orientation);
  const expectedSet = new Set(dev.expected.map(norm));

  function handleDrop(from: string, to: string): boolean {
    if (verdict !== "idle" || !fen) return false;
    const ch = new Chess(fen);
    let san: string | null = null;
    try {
      san = ch.move({ from, to, promotion: "q" }).san;
    } catch {
      return false;
    }
    setPlayed(san);
    if (expectedSet.has(norm(san))) {
      setVerdict("correct");
    } else {
      setVerdict("wrong");
    }
    return true;
  }

  function next() {
    setVerdict("idle");
    setPlayed(null);
    setIdx((i) => i + 1);
  }

  return (
    <div className="page drill">
      <div className="row">
        <button className="link" onClick={onBack}>
          ← Back
        </button>
        <span className="muted small">
          {idx + 1} / {order.length} · {dev.studyName}
        </span>
      </div>

      <p className="muted small">
        You played <b>{dev.played}</b> in this game (move {dev.fullmove}). Play
        the move your repertoire expects.
      </p>

      {fen ? (
        <Board
          fen={fen}
          orientation={dev.orientation}
          draggable={verdict === "idle"}
          onDrop={handleDrop}
          boardThemeId={settings.boardThemeId}
          pieceSet={settings.pieceSet}
        />
      ) : (
        <p className="result wrong">Could not reconstruct this position.</p>
      )}

      <div className="drill-status">
        {verdict === "correct" && (
          <div className="wrong-block">
            <span className="result correct">
              ✓ {played} — that's your repertoire's move.
            </span>
            <button className="primary big" onClick={next}>
              Next
            </button>
          </div>
        )}
        {verdict === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ Not the studied move. Expected: <b>{dev.expected.join(", ")}</b>
            </span>
            <button className="primary big" onClick={next}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
