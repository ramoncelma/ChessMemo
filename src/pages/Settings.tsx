import { useState } from "react";
import { Board } from "../components/Board";
import {
  BOARD_THEMES,
  PIECE_SETS,
  SPEEDS,
  type PieceSet,
  type Settings as SettingsType,
  type Speed,
  type Theme,
} from "../settings";
import { LANGS, type Lang, useT, levelName, levelInterval } from "../i18n";
import { download, exportAll, importAll } from "../backup";

const PREVIEW_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

interface Props {
  settings: SettingsType;
  setBoardTheme: (id: string) => void;
  setPieceSet: (set: PieceSet) => void;
  setTheme: (theme: Theme) => void;
  setPositionMissResetsLine: (v: boolean) => void;
  setLang: (lang: Lang) => void;
  setLichessUser: (v: string) => void;
  setChesscomUser: (v: string) => void;
  setImportSince: (v: string) => void;
  setSpeed: (speed: Speed, on: boolean) => void;
  setOpponentDelayMs: (ms: number) => void;
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
  setLang,
  setLichessUser,
  setChesscomUser,
  setImportSince,
  setSpeed,
  setOpponentDelayMs,
}: Props) {
  const t = useT();
  const [section, setSection] = useState<Section>("appearance");

  async function exportData() {
    const b = await exportAll();
    download(`chessmemo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b));
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      await importAll(JSON.parse(text));
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <div className="page">
      <h2>{t("settings.title")}</h2>

      <div className="seg">
        <button
          className={section === "appearance" ? "active" : ""}
          onClick={() => setSection("appearance")}
        >
          {t("settings.appearance")}
        </button>
        <button
          className={section === "practice" ? "active" : ""}
          onClick={() => setSection("practice")}
        >
          {t("settings.practiceTab")}
        </button>
        <button
          className={section === "about" ? "active" : ""}
          onClick={() => setSection("about")}
        >
          {t("settings.about")}
        </button>
      </div>

      {section === "appearance" && (
        <>
          <section>
            <h3 className="section-label">{t("settings.language")}</h3>
            <select
              className="select"
              value={settings.lang}
              onChange={(e) => setLang(e.target.value as Lang)}
            >
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </section>

          <section>
            <h3 className="section-label">{t("settings.theme")}</h3>
            <div className="seg">
              <button
                className={settings.theme === "light" ? "active" : ""}
                onClick={() => setTheme("light")}
              >
                {t("settings.light")}
              </button>
              <button
                className={settings.theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark")}
              >
                {t("settings.dark")}
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
            <h3 className="section-label">{t("settings.board")}</h3>
            <div className="swatch-grid">
              {BOARD_THEMES.map((tm) => (
                <button
                  key={tm.id}
                  className={`swatch ${settings.boardThemeId === tm.id ? "active" : ""}`}
                  onClick={() => setBoardTheme(tm.id)}
                >
                  <span className="swatch-tiles">
                    <span style={{ background: tm.light }} />
                    <span style={{ background: tm.dark }} />
                    <span style={{ background: tm.dark }} />
                    <span style={{ background: tm.light }} />
                  </span>
                  {tm.name}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-label">{t("settings.pieces")}</h3>
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
        <>
          <section>
            <h3 className="section-label">{t("settings.behaviour")}</h3>
            <label className="toggle-row">
              <span>
                <span className="toggle-title">{t("settings.posReset")}</span>
                <span className="muted small">{t("settings.posResetDesc")}</span>
              </span>
              <input
                type="checkbox"
                checked={settings.positionMissResetsLine}
                onChange={(e) => setPositionMissResetsLine(e.target.checked)}
              />
            </label>
            <div className="delay-row">
              <div>
                <div className="toggle-title">Opponent move delay</div>
                <div className="muted small">
                  How long ({settings.opponentDelayMs} ms) the board waits
                  before showing the opponent's reply.
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={1500}
                step={50}
                value={settings.opponentDelayMs}
                onChange={(e) => setOpponentDelayMs(Number(e.target.value))}
              />
            </div>
          </section>

          <section>
            <h3 className="section-label">Profile data</h3>
            <p className="muted small">
              Export to back up or move your data; import on another device.
            </p>
            <div className="row">
              <button onClick={exportData}>Export data</button>
              <label className="primary import-label">
                Import data
                <input
                  type="file"
                  accept="application/json"
                  onChange={importData}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </section>

          <section>
            <h3 className="section-label">{t("settings.lichessUser")}</h3>
            <input
              className="text-input"
              placeholder="magnuscarlsen"
              value={settings.lichessUser}
              onChange={(e) => setLichessUser(e.target.value)}
            />
          </section>

          <section>
            <h3 className="section-label">{t("settings.chesscomUser")}</h3>
            <input
              className="text-input"
              placeholder="hikaru"
              value={settings.chesscomUser}
              onChange={(e) => setChesscomUser(e.target.value)}
            />
          </section>

          <section>
            <h3 className="section-label">{t("settings.importSince")}</h3>
            <input
              className="text-input"
              type="date"
              value={settings.importSince}
              onChange={(e) => setImportSince(e.target.value)}
            />
          </section>

          <section>
            <h3 className="section-label">{t("settings.gameTypes")}</h3>
            <div className="speed-list">
              {SPEEDS.map((sp) => (
                <label key={sp} className="speed-row">
                  <input
                    type="checkbox"
                    checked={settings.speeds[sp]}
                    onChange={(e) => setSpeed(sp, e.target.checked)}
                  />
                  {t(`speed.${sp}`)}
                </label>
              ))}
            </div>
          </section>
        </>
      )}

      {section === "about" && (
        <section className="about">
          <h3 className="section-label">{t("about.h1")}</h3>
          <p>{t("about.p1")}</p>
          <p>{t("about.p2")}</p>
          <h3 className="section-label">{t("about.levelsH")}</h3>
          <ol className="level-legend">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <li key={i}>
                {t("about.levelLine", {
                  n: i,
                  name: levelName(t, i),
                  int: levelInterval(t, i),
                })}
              </li>
            ))}
          </ol>
          <h3 className="section-label">{t("about.timingH")}</h3>
          <p>{t("about.timing")}</p>
        </section>
      )}
    </div>
  );
}
