import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Board } from "../components/Board";
import { loadGames, loadManualGames, type RealGame } from "../games";
import { ensureEngineCacheLoaded, peekEval, type CachedEval } from "../engineCache";
import { fetchEval } from "../engine";
import type { Settings } from "../settings";

interface Props {
  settings: Settings;
  onExit: () => void;
}

type Phase = "scanning" | "asking" | "answered" | "empty";

interface Position {
  // Position right after the opponent's blunder — user is to move.
  fen: string;
  // Move number for display.
  fullmove: number;
  // Best move the engine suggests (user's punishing reply).
  bestSan: string;
  bestFrom: string;
  bestTo: string;
  // Source game for context.
  source: { url: string; opponent: string };
}

function toWhitePov(ev: CachedEval, fen: string): CachedEval {
  const stm = fen.split(" ")[1];
  if (stm !== "b") return ev;
  return {
    ...ev,
    cp: ev.cp !== undefined ? -ev.cp : undefined,
    mate: ev.mate !== undefined ? -ev.mate : undefined,
  };
}
function evalToCp(ev: CachedEval): number {
  if (ev.mate !== undefined) {
    const sign = ev.mate >= 0 ? 1 : -1;
    return sign * (100_000 - Math.abs(ev.mate));
  }
  return ev.cp ?? 0;
}

// Scan downloaded games for positions where the OPPONENT blundered (eval
// swung against them by >= threshold), and the eval afterwards shows the
// user is winning. Uses only the in-memory engine cache — fetches are
// expensive and we don't want to hammer the API just to find candidates.
export function BlunderKiller({ settings, onExit }: Props) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [pos, setPos] = useState<Position | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0, rounds: 0 });
  const [revealed, setRevealed] = useState(false);
  const [scanMsg, setScanMsg] = useState("Loading games…");
  const blunderCpDelta = 3 * settings.forgiveCpTolerance;

  useEffect(() => {
    void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scan() {
    setPhase("scanning");
    setRevealed(false);
    setScanMsg("Loading games and engine cache…");
    await ensureEngineCacheLoaded();
    const [autoGames, manualGames] = await Promise.all([
      loadGames(),
      loadManualGames(),
    ]);
    const games: RealGame[] = [...autoGames, ...manualGames];
    if (games.length === 0) {
      setPhase("empty");
      return;
    }
    setScanMsg(`Scanning ${games.length} games for blunders…`);

    // Walk every game move-by-move, looking for an opponent move whose
    // PRE and POST positions are both in the engine cache and the eval
    // swung against the opponent by >= the threshold.
    const candidates: Position[] = [];
    for (const game of games) {
      const userIsWhite = game.color === "white";
      const opponentParity = userIsWhite ? 1 : 0; // ply parity for opponent
      const ch = new Chess();
      for (let p = 0; p < game.moves.length; p++) {
        const san = game.moves[p];
        const fenBefore = ch.fen();
        let m;
        try {
          m = ch.move(san);
        } catch {
          break;
        }
        if (!m) break;
        const fenAfter = ch.fen();
        if (p % 2 !== opponentParity) continue; // only opponent moves
        const evBefore = peekEval(fenBefore);
        const evAfter = peekEval(fenAfter);
        if (!evBefore || !evAfter) continue;
        if (evBefore.notCached || evAfter.notCached) continue;
        const cpBefore = evalToCp(toWhitePov(evBefore, fenBefore));
        const cpAfter = evalToCp(toWhitePov(evAfter, fenAfter));
        // Opponent's loss: +cp swing if user is white, -cp swing if black.
        const userGain = userIsWhite ? cpAfter - cpBefore : cpBefore - cpAfter;
        if (userGain < blunderCpDelta) continue;
        // Position after the blunder — user to move. Need a "best move" to
        // grade the user. The engine cache holds cp/mate/depth but not the
        // PV's first SAN, so we fetch the full eval here. One API call per
        // candidate — acceptable since we only fetch one when ready to ask.
        candidates.push({
          fen: fenAfter,
          fullmove: Math.floor(p / 2) + 1,
          bestSan: "", // filled in lazily when we pick this candidate
          bestFrom: "",
          bestTo: "",
          source: { url: game.url, opponent: game.opponent },
        });
      }
    }
    if (candidates.length === 0) {
      setPhase("empty");
      return;
    }
    // Shuffle and pick the first one whose PV we can resolve.
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    for (const cand of shuffled) {
      const ev = await fetchEval(cand.fen, 1);
      if (!ev || ev.lines.length === 0) continue;
      const best = ev.lines[0];
      if (!best.firstSan || !best.firstUci) continue;
      const from = best.firstUci.slice(0, 2);
      const to = best.firstUci.slice(2, 4);
      setPos({ ...cand, bestSan: best.firstSan, bestFrom: from, bestTo: to });
      setPhase("asking");
      return;
    }
    setPhase("empty");
  }

  function tryDrop(from: string, to: string): boolean {
    if (!pos || phase !== "asking") return false;
    const correct = from === pos.bestFrom && to === pos.bestTo;
    setScore((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
      rounds: s.rounds + 1,
    }));
    setRevealed(true);
    setPhase("answered");
    return correct;
  }

  const arrows: [Square, Square, string?][] =
    revealed && pos
      ? [[pos.bestFrom as Square, pos.bestTo as Square, "rgba(46, 130, 60, 0.85)"]]
      : [];

  return (
    <div className="page">
      <div className="row">
        <button className="link" onClick={onExit}>
          ← Back
        </button>
        <span className="muted small">Blunder killer</span>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="muted small">
          Correct: <strong>{score.correct}</strong> · Wrong:{" "}
          <strong>{score.wrong}</strong> · Rounds:{" "}
          <strong>{score.rounds}</strong>
        </span>
      </div>

      {phase === "scanning" && <p className="muted">{scanMsg}</p>}

      {phase === "empty" && (
        <div>
          <p className="muted">
            No blunders found. The scanner walks every downloaded game
            looking for opponent moves where the engine cache shows a swing
            of at least {blunderCpDelta} cp against them. Two ways this
            comes up empty:
          </p>
          <ul className="muted small">
            <li>No real games downloaded yet (Real games tab).</li>
            <li>
              No engine evals cached at those positions. Open positions in
              the Read explorer (Read → repertoire → step through) to warm
              the engine cache, or analyse some of the games on Lichess and
              hit "Refresh Stockfish evals".
            </li>
          </ul>
          <button onClick={onExit}>Back</button>
        </div>
      )}

      {phase !== "scanning" && phase !== "empty" && pos && (
        <div className="read-layout">
          <div className="read-board">
            <Board
              fen={pos.fen}
              orientation={pos.fen.split(" ")[1] === "w" ? "white" : "black"}
              draggable={phase === "asking"}
              onDrop={tryDrop}
              boardThemeId={settings.boardThemeId}
              pieceSet={settings.pieceSet}
              arrows={arrows}
            />
            <p className="muted small" style={{ marginTop: 8 }}>
              From your game vs <strong>{pos.source.opponent}</strong>,
              move {pos.fullmove}.
            </p>
          </div>
          <div className="read-panel">
            {phase === "asking" && (
              <p>
                Your opponent just blundered. Find the punishing move —
                play it on the board.
              </p>
            )}
            {phase === "answered" && (
              <div>
                <p>
                  Engine's pick:{" "}
                  <strong style={{ fontSize: "1.4rem" }}>{pos.bestSan}</strong>
                </p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="primary" onClick={scan}>
                    Next blunder
                  </button>
                  <button onClick={onExit}>Exit</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
