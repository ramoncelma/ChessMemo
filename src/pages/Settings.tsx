import { useState } from "react";
import { Board } from "../components/Board";
import {
  BOARD_THEMES,
  PIECE_SETS,
  type PieceSet,
  type Settings as SettingsType,
  type Theme,
} from "../settings";
import { LEVEL_NAMES } from "../srs";

const PREVIEW_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

interface Props {
  settings: SettingsType;
  setBoardTheme: (id: string) => void;
  setPieceSet: (set: PieceSet) => void;
  setTheme: (theme: Theme) => void;
  setPositionMissResetsLine: (v: boolean) => void;
}

type Section = "appearance" | "practice" | "about";

function pieceThumb(set: PieceSet): string {
  return `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/${set}/wN.svg`;
}

export function Settings({
  settings,
  setBoardTheme,
  setPieceSet,
  setTheme,
  setPositionMissResetsLine,
}: Props) {
  const [section, setSection] = useState<Section>("appearance");

  return (
    <div className="page">
      <h2>Settings</h2>

      <div className="seg">
        <button
          className={section === "appearance" ? "active" : ""}
          onClick={() => setSection("appearance")}
        >
          Appearance
        </button>
        <button
          className={section === "practice" ? "active" : ""}
          onClick={() => setSection("practice")}
        >
          Practice
        </button>
        <button
          className={section === "about" ? "active" : ""}
          onClick={() => setSection("about")}
        >
          About
        </button>
      </div>

      {section === "appearance" && (
        <>
          <section>
            <h3 className="section-label">Theme</h3>
            <div className="seg">
              <button
                className={settings.theme === "light" ? "active" : ""}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
              <button
                className={settings.theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
            </div>
          </section>

          <div className="preview">
            <Board
              fen={PREVIEW_FEN}
              orientation="white"
              draggable={false}
              onDrop={() => false}
              boardThemeId={settings.boardThemeId}
              pieceSet={settings.pieceSet}
            />
          </div>

          <section>
            <h3 className="section-label">Board</h3>
            <div className="swatch-grid">
              {BOARD_THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`swatch ${settings.boardThemeId === t.id ? "active" : ""}`}
                  onClick={() => setBoardTheme(t.id)}
                >
                  <span className="swatch-tiles">
                    <span style={{ background: t.light }} />
                    <span style={{ background: t.dark }} />
                    <span style={{ background: t.dark }} />
                    <span style={{ background: t.light }} />
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-label">Pieces</h3>
            <div className="piece-grid">
              {PIECE_SETS.map((set) => (
                <button
                  key={set}
                  className={`piece-option ${settings.pieceSet === set ? "active" : ""}`}
                  onClick={() => setPieceSet(set)}
                >
                  <img src={pieceThumb(set)} alt={set} />
                  <span>{set}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {section === "practice" && (
        <section>
          <h3 className="section-label">Behaviour</h3>
          <label className="toggle-row">
            <span>
              <span className="toggle-title">Position misses reset the line</span>
              <span className="muted small">
                A wrong move in "Practice position" sends that line back to the
                start of the spaced-repetition cycle.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.positionMissResetsLine}
              onChange={(e) => setPositionMissResetsLine(e.target.checked)}
            />
          </label>
        </section>
      )}

      {section === "about" && (
        <section className="about">
          <h3 className="section-label">How spaced repetition works</h3>
          <p>
            ChessMemo trains whole <b>lines</b> — a complete sequence from the
            start of a chapter to the end of a variation. Each line is one item
            you review on a schedule.
          </p>
          <p>
            When a line is due, you play through it move by move. If you play the
            entire line correctly — no wrong moves, no hints, and each move
            within the time limit — the line is <b>promoted</b> to the next level
            and won't be shown again until later. Any slip sends it back to the
            first level so you see it again soon.
          </p>
          <h3 className="section-label">The levels</h3>
          <ol className="level-legend">
            {LEVEL_NAMES.slice(1).map((name, i) => (
              <li key={i}>
                <b>Level {i + 1}</b> — review again in {name}
              </li>
            ))}
          </ol>
          <p className="muted small">
            New lines start unscheduled and are due immediately. A line at the
            top level recurs every 6 months.
          </p>
          <h3 className="section-label">Hints &amp; timing</h3>
          <p>
            Asking for a <b>hint</b> shows the piece to move but counts the line
            as missed. A move that takes longer than <b>30 seconds</b> also
            counts as missed (you can still finish — the timer just turns red).
          </p>
          <p>
            <b>Practice again</b> on a line that isn't due lets you rehearse
            without changing its next date — unless you miss, which resets it.
          </p>
        </section>
      )}
    </div>
  );
}
