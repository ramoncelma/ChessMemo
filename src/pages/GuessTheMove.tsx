import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import type { Settings } from "../settings";
import type { Line, Study } from "../types";

interface Props {
  study: Study;
  chapterIdx: number | null;
  startDepth: number;
  settings: Settings;
  onExit: () => void;
}

type Phase = "playing" | "wrong" | "lineDone";

// Game: random line, first `startDepth` plies auto-played, then the user
// guesses each of their own moves while opponent moves auto-play. No SRS
// writes. On a miss we show "wrong" and let them try again; the correct
// move is only revealed if they ask. When the line completes (or they
// choose Next) a fresh line is dealt.
export function GuessTheMove({
  study,
  chapterIdx,
  startDepth,
  settings,
  onExit,
}: Props) {
  const userSide: "w" | "b" = study.orientation === "white" ? "w" : "b";
  // Pool of lines matching the chapter filter and the requested depth.
  const pool = useMemo<Line[]>(() => {
    let lines = study.lines.filter((l) => !l.paused);
    if (chapterIdx !== null)
      lines = lines.filter((l) => l.chapterIdx === chapterIdx);
    return lines.filter((l) => l.moves.length > startDepth);
  }, [study, chapterIdx, startDepth]);

  const [line, setLine] = useState<Line | null>(null);
  const [plyIdx, setPlyIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0, lines: 0 });
  const opponentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deal a fresh line at mount and whenever the pool changes.
  useEffect(() => {
    pickRandomLine();
    return () => {
      if (opponentTimer.current) {
        clearTimeout(opponentTimer.current);
        opponentTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  // When phase becomes "playing" and the move at plyIdx is the opponent's,
  // auto-advance after the opponent delay. The user only ever interacts at
  // user-side plies.
  useEffect(() => {
    if (!line || phase !== "playing") return;
    if (plyIdx >= line.moves.length) {
      setPhase("lineDone");
      setScore((s) => ({ ...s, lines: s.lines + 1 }));
      return;
    }
    const m = line.moves[plyIdx];
    if (m.color !== userSide) {
      if (opponentTimer.current) clearTimeout(opponentTimer.current);
      opponentTimer.current = setTimeout(() => {
        setPlyIdx((i) => i + 1);
      }, settings.opponentDelayMs);
    }
    return () => {
      if (opponentTimer.current) {
        clearTimeout(opponentTimer.current);
        opponentTimer.current = null;
      }
    };
  }, [line, plyIdx, phase, userSide, settings.opponentDelayMs]);

  function pickRandomLine() {
    if (pool.length === 0) {
      setLine(null);
      return;
    }
    const l = pool[Math.floor(Math.random() * pool.length)];
    setLine(l);
    setPlyIdx(Math.min(startDepth, l.moves.length));
    setPhase("playing");
    setRevealed(false);
  }

  function tryDrop(from: string, to: string): boolean {
    if (!line || phase !== "playing") return false;
    if (plyIdx >= line.moves.length) return false;
    const expected = line.moves[plyIdx];
    if (expected.color !== userSide) return false;
    // We validate against expected.from/to/promotion rather than computing
    // the SAN — keeps the rules engine out of the hot path and avoids
    // ambiguity around promotion piece selection.
    const correct =
      from === expected.from &&
      to === expected.to &&
      (expected.promotion ? "q" === expected.promotion : true);
    if (correct) {
      setPlyIdx((i) => i + 1);
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      return true;
    }
    setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    setPhase("wrong");
    return false;
  }

  function tryAgain() {
    setPhase("playing");
  }

  function reveal() {
    setRevealed(true);
  }

  function acceptAndAdvance() {
    if (!line) return;
    setRevealed(false);
    setPhase("playing");
    setPlyIdx((i) => i + 1);
  }

  // Compute board FEN from the move list up to plyIdx.
  const fen = useMemo(() => {
    if (!line) return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (plyIdx === 0) return new Chess().fen();
    return line.moves[plyIdx - 1].fenAfter;
  }, [line, plyIdx]);

  const expectedSan =
    line && plyIdx < line.moves.length ? line.moves[plyIdx].san : "";

  return (
    <div className="page">
      <div className="row">
        <button className="link" onClick={onExit}>
          ← Back
        </button>
        <span className="muted small">
          Guess the move · {study.name}
          {chapterIdx !== null ? ` · ${study.chapters[chapterIdx]?.name}` : ""}
        </span>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="muted small">
          Correct: <strong>{score.correct}</strong> · Wrong:{" "}
          <strong>{score.wrong}</strong> · Lines completed:{" "}
          <strong>{score.lines}</strong>
        </span>
      </div>

      {!line ? (
        <p className="muted">
          No line in this repertoire is long enough for the chosen depth
          ({startDepth} plies). Lower the depth and come back.
        </p>
      ) : (
        <div className="read-layout">
          <div className="read-board">
            <Board
              fen={fen}
              orientation={study.orientation}
              draggable={phase === "playing"}
              onDrop={tryDrop}
              boardThemeId={settings.boardThemeId}
              pieceSet={settings.pieceSet}
            />
          </div>
          <div className="read-panel">
            {phase === "playing" && plyIdx < line.moves.length && (
              <p>
                {line.moves[plyIdx].color === userSide
                  ? "Your move."
                  : "Opponent thinking…"}
              </p>
            )}
            {phase === "wrong" && (
              <div>
                <p>
                  <strong>Not quite.</strong>{" "}
                  {revealed ? (
                    <>
                      The repertoire plays <strong>{expectedSan}</strong>.
                    </>
                  ) : (
                    "Try again or peek."
                  )}
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <button onClick={tryAgain}>Try again</button>
                  {!revealed && <button onClick={reveal}>Show me</button>}
                  {revealed && (
                    <button className="primary" onClick={acceptAndAdvance}>
                      Continue
                    </button>
                  )}
                </div>
              </div>
            )}
            {phase === "lineDone" && (
              <div>
                <p>
                  <strong>Line complete.</strong>{" "}
                  {line.moves.map((m) => m.san).join(" ")}
                </p>
                <button className="primary" onClick={pickRandomLine}>
                  Next line
                </button>
              </div>
            )}
            <p className="muted small" style={{ marginTop: 12 }}>
              {line.moves.map((m, i) => (
                <span
                  key={i}
                  style={{
                    opacity: i < plyIdx ? 1 : 0.35,
                    fontWeight: i < plyIdx ? 600 : 400,
                  }}
                >
                  {m.san}{" "}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
