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
import { clearMastersCache } from "../weights";
import { clearRanThisSession } from "../weightsScheduler";
import {
  clearProfile,
  createGist,
  findGistByName,
  getProfile,
  pullFromCloud,
  pushToCloud,
  recreateGist,
  setProfile,
} from "../sync";

const PREVIEW_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

interface Props {
  settings: SettingsType;
  setBoardTheme: (id: string) => void;
  setPieceSet: (set: PieceSet) => void;
  setTheme: (theme: Theme) => void;
  setPositionMissResetsLine: (v: boolean) => void;
  setLang: (lang: Lang) => void;
  setLichessUser: (v: string) => void;
  setLichessToken: (v: string) => void;
  setChesscomUser: (v: string) => void;
  setImportSince: (v: string) => void;
  setSpeed: (speed: Speed, on: boolean) => void;
  setOpponentDelayMs: (ms: number) => void;
  setEngineLines: (n: 1 | 2 | 3) => void;
  setEngineArrows: (v: boolean) => void;
  setReplayFromStartOnMiss: (v: boolean) => void;
  setVacation: (on: boolean) => void;
  setChapterView: (v: "list" | "grid") => void;
  setForgiveIfEngineEquivalent: (v: boolean) => void;
  setForgiveCpTolerance: (cp: number) => void;
  setCoverageThreshold: (n: number) => void;
  setMaxMemorizationDepth: (n: number) => void;
  resetWeightsVersions: () => void;
}

type Section = "appearance" | "preferences" | "sync" | "about";

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
  setLichessToken,
  setChesscomUser,
  setImportSince,
  setSpeed,
  setOpponentDelayMs,
  setEngineLines,
  setEngineArrows,
  setReplayFromStartOnMiss,
  setVacation,
  setChapterView,
  setForgiveIfEngineEquivalent,
  setForgiveCpTolerance,
  setCoverageThreshold,
  setMaxMemorizationDepth,
  resetWeightsVersions,
}: Props) {
  const t = useT();
  const [section, setSection] = useState<Section>("appearance");
  const [profile, setProfileState] = useState(() => getProfile());
  const [profileForm, setProfileForm] = useState({
    name: "",
    token: "",
    gistId: "",
  });
  const [profileBusy, setProfileBusy] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  function refreshProfile() {
    setProfileState(getProfile());
  }

  async function handleCreate() {
    setProfileErr(null);
    setProfileMsg(null);
    if (!profileForm.name.trim() || !profileForm.token.trim()) {
      setProfileErr("Profile name and GitHub token are both required.");
      return;
    }
    setProfileBusy("create");
    try {
      const { gistId, updatedAt } = await createGist(
        profileForm.name.trim(),
        profileForm.token.trim(),
      );
      setProfile({
        name: profileForm.name.trim(),
        token: profileForm.token.trim(),
        gistId,
        lastSyncedAt: updatedAt,
      });
      refreshProfile();
      setProfileForm({ name: "", token: "", gistId: "" });
      setProfileMsg("Cloud profile created. Your data is backed up.");
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileBusy(null);
    }
  }

  async function handleLink() {
    setProfileErr(null);
    setProfileMsg(null);
    if (!profileForm.name.trim() || !profileForm.token.trim()) {
      setProfileErr("Profile name and GitHub token are both required.");
      return;
    }
    setProfileBusy("link");
    try {
      let gistId = profileForm.gistId.trim();
      if (!gistId) {
        const found = await findGistByName(
          profileForm.token.trim(),
          profileForm.name.trim(),
        );
        if (!found) {
          throw new Error(
            `No gist named "${profileForm.name.trim()}" found in your GitHub account.`,
          );
        }
        gistId = found;
      }
      setProfile({
        name: profileForm.name.trim(),
        token: profileForm.token.trim(),
        gistId,
        lastSyncedAt: 0,
      });
      await pullFromCloud();
      refreshProfile();
      setProfileForm({ name: "", token: "", gistId: "" });
      setProfileMsg("Linked. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : String(err));
      clearProfile();
      refreshProfile();
    } finally {
      setProfileBusy(null);
    }
  }

  async function handlePush() {
    setProfileErr(null);
    setProfileMsg(null);
    setProfileBusy("push");
    try {
      await pushToCloud();
      refreshProfile();
      setProfileMsg("Pushed local data to the cloud.");
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileBusy(null);
    }
  }

  async function handlePull() {
    setProfileErr(null);
    setProfileMsg(null);
    if (
      !confirm(
        "Replace this device's data with the cloud copy? Any local changes since the last sync will be lost.",
      )
    )
      return;
    setProfileBusy("pull");
    try {
      await pullFromCloud();
      setProfileMsg("Pulled cloud data. Reloading…");
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : String(err));
      setProfileBusy(null);
    }
  }

  function handleSignOut() {
    if (
      !confirm(
        "Sign out of this profile on this device? Your local data stays here; the cloud copy is not deleted.",
      )
    )
      return;
    clearProfile();
    refreshProfile();
    setProfileMsg("Signed out on this device.");
  }

  async function handleRecreateGist() {
    if (
      !confirm(
        "Delete the cloud profile gist and create a fresh one with this device's current data?\n\n" +
          "This permanently removes the old gist (and any leaked secrets in its history). Other devices linked to the old gist will need to re-link using the same profile name.",
      )
    )
      return;
    setProfileErr(null);
    setProfileMsg(null);
    setProfileBusy("recreate");
    try {
      await recreateGist();
      refreshProfile();
      setProfileMsg(
        "New gist created. The old one is gone. Re-link other devices via Link existing profile.",
      );
    } catch (err) {
      setProfileErr(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileBusy(null);
    }
  }

  function relTime(ms: number): string {
    if (!ms) return "never";
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.round(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.round(diff / 3600_000)} h ago`;
    return `${Math.round(diff / 86_400_000)} d ago`;
  }

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
          className={section === "preferences" ? "active" : ""}
          onClick={() => setSection("preferences")}
        >
          Preferences
        </button>
        <button
          className={section === "sync" ? "active" : ""}
          onClick={() => setSection("sync")}
        >
          Sync accounts
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

      {section === "sync" && (
        <>
          <section>
            <h3 className="section-label">Cloud profile</h3>
            {!profile ? (
              <>
                <p className="muted small">
                  Sync your repertoires and progress across devices via a
                  private GitHub gist. Create a{" "}
                  <a
                    href="https://github.com/settings/tokens/new?scopes=gist&description=ChessMemo"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    classic personal access token with the <code>gist</code>{" "}
                    scope
                  </a>{" "}
                  and paste it below.
                </p>
                <div className="profile-form">
                  <label className="field">
                    <span className="field-label">Profile name</span>
                    <input
                      className="text-input"
                      placeholder="Ramon"
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">GitHub token</span>
                    <input
                      className="text-input"
                      type="password"
                      placeholder="ghp_…"
                      value={profileForm.token}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, token: e.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">
                      Gist ID (optional, for linking an existing profile)
                    </span>
                    <input
                      className="text-input"
                      placeholder="leave blank to auto-find by name"
                      value={profileForm.gistId}
                      onChange={(e) =>
                        setProfileForm((f) => ({
                          ...f,
                          gistId: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="row">
                    <button
                      className="primary"
                      disabled={profileBusy !== null}
                      onClick={handleCreate}
                    >
                      {profileBusy === "create"
                        ? "Creating…"
                        : "Create cloud profile"}
                    </button>
                    <button
                      disabled={profileBusy !== null}
                      onClick={handleLink}
                    >
                      {profileBusy === "link"
                        ? "Linking…"
                        : "Link existing profile"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p>
                  Signed in as <strong>{profile.name}</strong>. Changes sync
                  automatically a few seconds after each edit.
                </p>
                <ul className="muted small profile-meta">
                  <li>
                    Gist:{" "}
                    <a
                      href={`https://gist.github.com/${profile.gistId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {profile.gistId.slice(0, 8)}…
                    </a>
                  </li>
                  <li>Last synced: {relTime(profile.lastSyncedAt)}</li>
                </ul>
                <div className="row">
                  <button
                    disabled={profileBusy !== null}
                    onClick={handlePush}
                  >
                    {profileBusy === "push" ? "Pushing…" : "Push now"}
                  </button>
                  <button
                    disabled={profileBusy !== null}
                    onClick={handlePull}
                  >
                    {profileBusy === "pull" ? "Pulling…" : "Pull from cloud"}
                  </button>
                  <button
                    disabled={profileBusy !== null}
                    onClick={handleRecreateGist}
                  >
                    {profileBusy === "recreate" ? "Recreating…" : "Reset gist"}
                  </button>
                  <button className="link" onClick={handleSignOut}>
                    Sign out
                  </button>
                </div>
              </>
            )}
            {profileMsg && (
              <p className="muted small profile-msg ok">{profileMsg}</p>
            )}
            {profileErr && (
              <p className="muted small profile-msg err">{profileErr}</p>
            )}
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
            <h3 className="section-label">Lichess API token (optional)</h3>
            <p className="muted small">
              The masters opening explorer can return 401 to anonymous
              requests on some networks. A personal Lichess token bypasses
              that.{" "}
              <a
                href="https://lichess.org/account/oauth/token/create?description=ChessMemo"
                target="_blank"
                rel="noopener noreferrer"
              >
                Create a token
              </a>{" "}
              (no scopes needed) and paste it below. <strong>This token
              stays on this device only</strong> — it is never sent to the
              cloud profile, so you'll need to paste it again on each
              device you use.
            </p>
            <input
              className="text-input"
              type="password"
              placeholder="lip_…"
              value={settings.lichessToken}
              onChange={(e) => setLichessToken(e.target.value)}
            />
            <div className="row" style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      "Clear the cached masters data and recompute every study's weights? This refetches every position from Lichess.",
                    )
                  )
                    return;
                  await clearMastersCache();
                  clearRanThisSession();
                  resetWeightsVersions();
                }}
              >
                Refresh GM weights
              </button>
              <span className="muted small">
                Re-pulls the latest master games from Lichess for every line
                in every repertoire.
              </span>
            </div>
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

          <section>
            <h3 className="section-label">Export ChessMemo data</h3>
            <p className="muted small">
              Download a JSON backup or restore from one. Cloud profile syncs
              this automatically, so this is mostly for off-device backups.
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
        </>
      )}

      {section === "preferences" && (
        <>
          <section>
            <h3 className="section-label">Vacation mode</h3>
            <label className="toggle-row">
              <span>
                <span className="toggle-title">
                  {settings.vacationStartedAt
                    ? `On vacation since ${new Date(settings.vacationStartedAt).toLocaleDateString()}`
                    : "Vacation mode"}
                </span>
                <span className="muted small">
                  Freezes the spaced-repetition clock. Lines won't come due
                  while it's on; turning it off resumes scheduling without a
                  backlog of missed days.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.vacationStartedAt !== null}
                onChange={(e) => setVacation(e.target.checked)}
              />
            </label>
          </section>

          <section>
            <h3 className="section-label">Chapter view</h3>
            <div className="delay-row">
              <div>
                <div className="toggle-title">How chapters are shown</div>
                <div className="muted small">
                  In Practice and Read, list the chapters as a dropdown or as
                  a grid of cards with progress.
                </div>
              </div>
              <div className="seg compact">
                <button
                  className={settings.chapterView === "list" ? "active" : ""}
                  onClick={() => setChapterView("list")}
                >
                  List
                </button>
                <button
                  className={settings.chapterView === "grid" ? "active" : ""}
                  onClick={() => setChapterView("grid")}
                >
                  Grid
                </button>
              </div>
            </div>
          </section>

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
            <label className="toggle-row">
              <span>
                <span className="toggle-title">Replay full line on miss</span>
                <span className="muted small">
                  After a wrong move, restart the line from move 1 instead of
                  skipping past the missed move. Helps rebuild the full
                  sequence in memory.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.replayFromStartOnMiss}
                onChange={(e) => setReplayFromStartOnMiss(e.target.checked)}
              />
            </label>
            <label className="toggle-row">
              <span>
                <span className="toggle-title">
                  Forgive engine-equivalent moves
                </span>
                <span className="muted small">
                  After a wrong move, ask Stockfish: if your move is within the
                  tolerance below of the expected one, offer a "Retry without
                  penalty" button instead of grading it as a miss.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.forgiveIfEngineEquivalent}
                onChange={(e) =>
                  setForgiveIfEngineEquivalent(e.target.checked)
                }
              />
            </label>
            <div className="delay-row">
              <div>
                <div className="toggle-title">
                  Equivalence tolerance ({(settings.forgiveCpTolerance / 100).toFixed(2)} pawns)
                </div>
                <div className="muted small">
                  Maximum evaluation gap, either way, that still counts as
                  engine-equivalent. Smaller values are stricter.
                </div>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={settings.forgiveCpTolerance}
                disabled={!settings.forgiveIfEngineEquivalent}
                onChange={(e) =>
                  setForgiveCpTolerance(Number(e.target.value))
                }
              />
            </div>
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
            <label className="toggle-row">
              <span>
                <span className="toggle-title">Engine arrows on board</span>
                <span className="muted small">
                  Draw the engine's top moves as arrows; brightness scales with
                  how close each move is to the best one.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.engineArrows}
                onChange={(e) => setEngineArrows(e.target.checked)}
              />
            </label>
            <div className="delay-row">
              <div>
                <div className="toggle-title">Engine lines to show</div>
                <div className="muted small">
                  How many top variations to request from Stockfish.
                </div>
              </div>
              <div className="seg compact">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    className={settings.engineLines === n ? "active" : ""}
                    onClick={() => setEngineLines(n as 1 | 2 | 3)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="delay-row">
              <div>
                <div className="toggle-title">
                  Rare-line threshold (1 in {settings.coverageThreshold})
                </div>
                <div className="muted small">
                  Used by "Exclude rarer than" in Practice and Read. Lines
                  whose master-game frequency is below this get paused.
                </div>
              </div>
              <div className="seg compact">
                {[100, 150, 200, 300, 400, 500].map((n) => (
                  <button
                    key={n}
                    className={settings.coverageThreshold === n ? "active" : ""}
                    onClick={() => setCoverageThreshold(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="delay-row">
              <div>
                <div className="toggle-title">
                  Max memorization depth ({settings.maxMemorizationDepth} moves)
                </div>
                <div className="muted small">
                  Errors past this ply are still shown as missed, but the line
                  is graded as if you'd played it cleanly for spaced
                  repetition.
                </div>
              </div>
              <input
                type="range"
                min={5}
                max={60}
                step={1}
                value={settings.maxMemorizationDepth}
                onChange={(e) =>
                  setMaxMemorizationDepth(Number(e.target.value))
                }
              />
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
