import { useState } from "react";
import { GuessTheMove } from "./GuessTheMove";
import { IsThisCorrect } from "./IsThisCorrect";
import { BlunderKiller } from "./BlunderKiller";
import type { Settings } from "../settings";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  settings: Settings;
}

type GameId = "guess" | "blunder" | "iscorrect" | null;

// "Games" tab. Picks one of three mini-games, runs it inline. None of
// these games write to SRS / FSRS — results are session-local. The
// shell here just hosts the cards and routes to a sub-page.
export function Games({ studies, settings }: Props) {
  const [active, setActive] = useState<GameId>(null);
  const [setupStudyId, setSetupStudyId] = useState<string>(
    studies[0]?.id ?? "",
  );
  const [setupChapterIdx, setSetupChapterIdx] = useState<number | null>(null);
  const [setupDepth, setSetupDepth] = useState<number>(6);

  const study = studies.find((s) => s.id === setupStudyId) ?? null;

  if (active === "guess" && study) {
    return (
      <GuessTheMove
        study={study}
        chapterIdx={setupChapterIdx}
        startDepth={setupDepth}
        settings={settings}
        onExit={() => setActive(null)}
      />
    );
  }
  if (active === "iscorrect" && study) {
    return (
      <IsThisCorrect
        study={study}
        chapterIdx={setupChapterIdx}
        startDepth={setupDepth}
        settings={settings}
        onExit={() => setActive(null)}
      />
    );
  }
  if (active === "blunder") {
    return <BlunderKiller settings={settings} onExit={() => setActive(null)} />;
  }

  if (studies.length === 0) {
    return (
      <div className="page center">
        <h2>Games</h2>
        <p className="muted">
          Add a repertoire first — the games run on lines from your
          repertoires.
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Games</h2>
      <p className="muted">
        Drills that don't affect your spaced repetition / FSRS schedule.
        Pick a repertoire and a starting depth, then choose a game.
      </p>

      <section className="study-card">
        <h3 className="section-label">Setup</h3>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label className="row" style={{ gap: 6 }}>
            <span className="muted small">Repertoire</span>
            <select
              className="text-input"
              value={setupStudyId}
              onChange={(e) => {
                setSetupStudyId(e.target.value);
                setSetupChapterIdx(null);
              }}
            >
              {studies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.orientation})
                </option>
              ))}
            </select>
          </label>

          {study && study.chapters.length > 1 && (
            <label className="row" style={{ gap: 6 }}>
              <span className="muted small">Chapter</span>
              <select
                className="text-input"
                value={setupChapterIdx === null ? "" : String(setupChapterIdx)}
                onChange={(e) =>
                  setSetupChapterIdx(
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                <option value="">All chapters</option>
                {study.chapters.map((c, i) => (
                  <option key={i} value={String(i)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="row" style={{ gap: 6 }}>
            <span className="muted small">Start at ply</span>
            <input
              className="text-input"
              style={{ width: 70 }}
              type="number"
              min={0}
              max={60}
              step={1}
              value={setupDepth}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0) setSetupDepth(n);
              }}
            />
            <span className="muted small">
              ({setupDepth} plies = {Math.ceil(setupDepth / 2)} full moves
              auto-played before you start guessing)
            </span>
          </label>
        </div>
      </section>

      <section className="study-card">
        <div className="list-title">Guess the move</div>
        <p className="muted small">
          A random line is loaded and the first {setupDepth} plies are
          played automatically. You then play out the rest of the line —
          opponent moves auto-play, you guess each of your own moves. No
          SRS impact.
        </p>
        <button
          className="primary"
          disabled={!study}
          onClick={() => setActive("guess")}
        >
          Play
        </button>
      </section>

      <section className="study-card">
        <div className="list-title">Is this correct?</div>
        <p className="muted small">
          A position is shown with a candidate move — your job is to say
          whether it's covered by the repertoire. Wrong-move distractors
          are filtered to be at least 3× your engine forgiveness threshold
          worse so the answer is unambiguous.
        </p>
        <button
          className="primary"
          disabled={!study}
          onClick={() => setActive("iscorrect")}
        >
          Play
        </button>
      </section>

      <section className="study-card">
        <div className="list-title">Blunder killer</div>
        <p className="muted small">
          A blunder pulled from a real downloaded Lichess game — find the
          tactic that punishes it. Requires engine evals cached for the
          game positions (Read mode warms the cache as you step through;
          you can also "Refresh Stockfish evals" in Settings).
        </p>
        <button className="primary" onClick={() => setActive("blunder")}>
          Play
        </button>
      </section>
    </div>
  );
}
