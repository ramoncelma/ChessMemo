import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Board } from "../components/Board";
import {
  ensureLichessCacheLoaded,
  ensureMastersCacheLoaded,
  peekLichess,
  peekMasters,
} from "../weights";
import { ensureEngineCacheLoaded, lookupEval, type CachedEval } from "../engineCache";
import type { Settings } from "../settings";
import type { Line, Study } from "../types";

interface Props {
  study: Study;
  chapterIdx: number | null;
  startDepth: number;
  settings: Settings;
  onExit: () => void;
}

type Phase = "loading" | "asking" | "answered";

interface Round {
  parentFen: string;
  candidateSan: string;
  candidateFrom: string;
  candidateTo: string;
  isCorrect: boolean; // is the candidate in the repertoire at parent?
  parentSans: string; // SANs played to reach parent (for display)
}

function normSan(s: string): string {
  return s.replace(/[+#!?]/g, "");
}

// Normalise an eval to "+ = white better" regardless of side to move at
// the queried FEN. Lichess Cloud Eval returns side-to-move POV.
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

// Pick a position at-or-after `depth` where the user's side is to move and
// has a recorded move in the repertoire's line. Used as the "target" of
// the round.
function pickTarget(
  line: Line,
  userSide: "w" | "b",
  depth: number,
): number | null {
  for (let i = Math.max(0, depth); i < line.moves.length; i++) {
    if (line.moves[i].color === userSide) return i;
  }
  return null;
}

// Collect every SAN the repertoire covers at the given FEN (across all
// lines — handles transpositions / sister lines).
function coveredAtFen(study: Study, fen: string): Set<string> {
  const set = new Set<string>();
  for (const line of study.lines) {
    for (const m of line.moves) {
      if (m.fenBefore === fen) set.add(normSan(m.san));
    }
  }
  return set;
}

export function IsThisCorrect({
  study,
  chapterIdx,
  startDepth,
  settings,
  onExit,
}: Props) {
  const userSide: "w" | "b" = study.orientation === "white" ? "w" : "b";
  const [round, setRound] = useState<Round | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [loadingMsg, setLoadingMsg] = useState<string>("");
  const [score, setScore] = useState({ correct: 0, wrong: 0, rounds: 0 });

  // Threshold for declaring a candidate "wrong" (objectively worse than the
  // repertoire move by this many centipawns, from the user's POV).
  const wrongCpDelta = 3 * settings.forgiveCpTolerance;

  useEffect(() => {
    void buildNextRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buildNextRound() {
    setPhase("loading");
    setLastAnswerCorrect(null);
    setLoadingMsg("Picking a position…");
    await Promise.all([
      ensureMastersCacheLoaded(),
      ensureLichessCacheLoaded(),
      ensureEngineCacheLoaded(),
    ]);

    let pool = study.lines.filter((l) => !l.paused);
    if (chapterIdx !== null) pool = pool.filter((l) => l.chapterIdx === chapterIdx);
    pool = pool.filter((l) => l.moves.length > startDepth);
    if (pool.length === 0) {
      setRound(null);
      setPhase("asking");
      return;
    }

    // Try up to N candidates. 50% of the time we ask for a correct move
    // (use the repertoire's own SAN) and 50% we look for a verifiably bad
    // alternative. We re-roll if a side can't be produced.
    const MAX_TRIES = 8;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const line = pool[Math.floor(Math.random() * pool.length)];
      const targetPly = pickTarget(line, userSide, startDepth);
      if (targetPly === null) continue;
      const targetMove = line.moves[targetPly];
      const parentFen = targetMove.fenBefore;
      const parentSans = line.moves.slice(0, targetPly).map((m) => m.san).join(" ");
      const askCorrect = Math.random() < 0.5;
      if (askCorrect) {
        setRound({
          parentFen,
          candidateSan: targetMove.san,
          candidateFrom: targetMove.from,
          candidateTo: targetMove.to,
          isCorrect: true,
          parentSans,
        });
        setPhase("asking");
        return;
      }
      // Look for a wrong candidate. Combine explorer moves from GM + Li
      // at this FEN, drop everything the repertoire covers, then test
      // each by eval delta against the repertoire's move.
      const gm = peekMasters(parentFen);
      const li = peekLichess(parentFen);
      const candidates = new Set<string>();
      if (gm)
        for (const [san, count] of gm.counts) {
          if (count > 0) candidates.add(san);
        }
      if (li)
        for (const [san, count] of li.counts) {
          if (count > 0) candidates.add(san);
        }
      // Strip repertoire-covered moves.
      const covered = coveredAtFen(study, parentFen);
      for (const c of covered) candidates.delete(c);
      if (candidates.size === 0) continue;

      // Build the reference: repertoire's child eval (we look up — fetches
      // if not cached, which is slow but correct).
      const refChess = new Chess(parentFen);
      let refChildFen: string;
      try {
        const m = refChess.move(targetMove.san);
        if (!m) continue;
        refChildFen = refChess.fen();
      } catch {
        continue;
      }
      setLoadingMsg("Evaluating positions… (this can take a few seconds)");
      const refEv = await lookupEval(refChildFen, 1);
      if (!refEv || refEv.notCached) continue;
      const refEvalCp = evalToCp(toWhitePov(refEv, refChildFen));

      // Try each candidate (shuffled so we don't keep showing the same).
      const shuffled = [...candidates].sort(() => Math.random() - 0.5);
      for (const san of shuffled.slice(0, 4)) {
        const ch = new Chess(parentFen);
        let m;
        try {
          m = ch.move(san);
        } catch {
          continue;
        }
        if (!m) continue;
        const childFen = ch.fen();
        const ev = await lookupEval(childFen, 1);
        if (!ev || ev.notCached) continue;
        const candCp = evalToCp(toWhitePov(ev, childFen));
        const userLoss =
          userSide === "w" ? refEvalCp - candCp : candCp - refEvalCp;
        if (userLoss >= wrongCpDelta) {
          setRound({
            parentFen,
            candidateSan: m.san,
            candidateFrom: m.from,
            candidateTo: m.to,
            isCorrect: false,
            parentSans,
          });
          setPhase("asking");
          return;
        }
      }
      // No wrong candidate met the bar — try a different line.
    }

    // Exhausted attempts. Fall back to a correct candidate.
    const line = pool[Math.floor(Math.random() * pool.length)];
    const targetPly = pickTarget(line, userSide, startDepth);
    if (targetPly === null) {
      setRound(null);
      setPhase("asking");
      return;
    }
    const targetMove = line.moves[targetPly];
    setRound({
      parentFen: targetMove.fenBefore,
      candidateSan: targetMove.san,
      candidateFrom: targetMove.from,
      candidateTo: targetMove.to,
      isCorrect: true,
      parentSans: line.moves.slice(0, targetPly).map((m) => m.san).join(" "),
    });
    setPhase("asking");
  }

  function answer(userSaysYes: boolean) {
    if (!round) return;
    const correct = userSaysYes === round.isCorrect;
    setLastAnswerCorrect(correct);
    setScore((s) => ({
      correct: s.correct + (correct ? 1 : 0),
      wrong: s.wrong + (correct ? 0 : 1),
      rounds: s.rounds + 1,
    }));
    setPhase("answered");
  }

  const arrows: [Square, Square, string?][] = round
    ? [
        [
          round.candidateFrom as Square,
          round.candidateTo as Square,
          "rgba(91,157,255,0.85)",
        ],
      ]
    : [];

  return (
    <div className="page">
      <div className="row">
        <button className="link" onClick={onExit}>
          ← Back
        </button>
        <span className="muted small">
          Is this correct? · {study.name}
          {chapterIdx !== null
            ? ` · ${study.chapters[chapterIdx]?.name}`
            : ""}
        </span>
      </div>

      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <span className="muted small">
          Correct: <strong>{score.correct}</strong> · Wrong:{" "}
          <strong>{score.wrong}</strong> · Rounds:{" "}
          <strong>{score.rounds}</strong>
        </span>
      </div>

      {phase === "loading" && (
        <p className="muted">
          {loadingMsg || "Loading…"}{" "}
          <span className="muted small">
            (cache lookups + Lichess Cloud Eval; wrong-move generation
            needs evals on both the repertoire move and the candidate)
          </span>
        </p>
      )}

      {round && (
        <div className="read-layout">
          <div className="read-board">
            <Board
              fen={round.parentFen}
              orientation={study.orientation}
              draggable={false}
              onDrop={() => false}
              boardThemeId={settings.boardThemeId}
              pieceSet={settings.pieceSet}
              arrows={arrows}
            />
            {round.parentSans && (
              <p className="muted small" style={{ marginTop: 8 }}>
                Moves so far: <strong>{round.parentSans}</strong>
              </p>
            )}
          </div>
          <div className="read-panel">
            <p>
              Candidate move:{" "}
              <strong style={{ fontSize: "1.4rem" }}>
                {round.candidateSan}
              </strong>
            </p>

            {phase === "asking" && (
              <div className="row" style={{ gap: 8 }}>
                <button className="primary" onClick={() => answer(true)}>
                  Yes — in repertoire
                </button>
                <button className="again" onClick={() => answer(false)}>
                  No — not in repertoire
                </button>
              </div>
            )}

            {phase === "answered" && (
              <div>
                <p>
                  {lastAnswerCorrect ? (
                    <strong>Correct.</strong>
                  ) : (
                    <strong>Wrong.</strong>
                  )}{" "}
                  The move{" "}
                  <strong>{round.candidateSan}</strong>{" "}
                  {round.isCorrect
                    ? "IS in the repertoire."
                    : "is NOT in the repertoire (≥ 3× your engine forgiveness threshold worse than the prep move)."}
                </p>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="primary" onClick={buildNextRound}>
                    Next round
                  </button>
                  <button onClick={onExit}>Exit</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!round && phase === "asking" && (
        <p className="muted">
          No line in this chapter is long enough at the chosen depth. Try
          lowering the start ply on the previous screen.
        </p>
      )}
    </div>
  );
}
