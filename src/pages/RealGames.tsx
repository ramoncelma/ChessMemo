import { useEffect, useState } from "react";
import { useT } from "../i18n";
import {
  analyzeAll,
  fetchChessComGames,
  fetchLichessGames,
  loadGames,
  loadManualGames,
  parseManualPgn,
  saveGames,
  saveManualGames,
  type RealGame,
  type StudyReport,
} from "../games";
import { SPEEDS } from "../settings";
import type { Settings } from "../settings";
import type { Study } from "../types";
import { MistakesMode } from "./MistakesMode";

interface Props {
  studies: Study[];
  settings: Settings;
  onSettings: () => void;
}

type View = "main" | "import" | "manual-list" | "fix-mistakes";

export function RealGames({ studies, settings, onSettings }: Props) {
  const t = useT();
  const [games, setGames] = useState<RealGame[] | null>(null);
  const [manualGames, setManualGames] = useState<RealGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStudyId, setFilterStudyId] = useState<string>("");
  const [view, setView] = useState<View>("main");
  const [importForm, setImportForm] = useState({
    name: "",
    color: "white" as "white" | "black",
    pgn: "",
  });
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    void loadGames().then(setGames);
    void loadManualGames().then(setManualGames);
  }, []);

  const lichessUser = settings.lichessUser.trim();
  const chesscomUser = settings.chesscomUser.trim();

  async function fetchNow() {
    setError(null);
    setLoading(true);
    try {
      const since = new Date(settings.importSince).getTime();
      const speeds = SPEEDS.filter((s) => settings.speeds[s]);
      const results = await Promise.all([
        lichessUser
          ? fetchLichessGames(lichessUser, since, speeds)
          : Promise.resolve([] as RealGame[]),
        chesscomUser
          ? fetchChessComGames(chesscomUser, since, speeds)
          : Promise.resolve([] as RealGame[]),
      ]);
      const g = [...results[0], ...results[1]];
      await saveGames(g);
      setGames(g);
    } catch {
      setError(t("rg.error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setImportError(null);
    if (!importForm.pgn.trim()) {
      setImportError("Paste a PGN first.");
      return;
    }
    const game = parseManualPgn(
      importForm.pgn,
      importForm.color,
      importForm.name.trim() || `Game ${manualGames.length + 1}`,
    );
    if (!game) {
      setImportError("Could not parse that PGN.");
      return;
    }
    const next = [...manualGames, game];
    setManualGames(next);
    await saveManualGames(next);
    setImportForm({ name: "", color: "white", pgn: "" });
    setView("manual-list");
  }

  async function renameManual(id: string, name: string) {
    const next = manualGames.map((g) =>
      g.id === id ? { ...g, opponent: name } : g,
    );
    setManualGames(next);
    await saveManualGames(next);
  }

  async function deleteManual(id: string) {
    if (!confirm("Delete this manual game?")) return;
    const next = manualGames.filter((g) => g.id !== id);
    setManualGames(next);
    await saveManualGames(next);
  }

  const allGames: RealGame[] = [...(games ?? []), ...manualGames];
  const reports: StudyReport[] = allGames.length
    ? analyzeAll(studies, allGames)
    : [];
  const relevant = reports.filter(
    (r) => r.followed.length > 0 || r.deviations.length > 0,
  );
  const filtered = filterStudyId
    ? relevant.filter((r) => r.study.id === filterStudyId)
    : relevant;

  // --- Subviews ---

  if (view === "import") {
    return (
      <div className="page">
        <div className="row">
          <button className="link" onClick={() => setView("main")}>
            {t("common.back")}
          </button>
          <h3 className="section-label">Import manual game</h3>
        </div>
        <div className="profile-form">
          <label className="field">
            <span className="field-label">Game name</span>
            <input
              className="text-input"
              placeholder="vs. John, club championship"
              value={importForm.name}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </label>
          <label className="field">
            <span className="field-label">You played as</span>
            <div className="seg compact">
              <button
                className={importForm.color === "white" ? "active" : ""}
                onClick={() =>
                  setImportForm((f) => ({ ...f, color: "white" }))
                }
              >
                White
              </button>
              <button
                className={importForm.color === "black" ? "active" : ""}
                onClick={() =>
                  setImportForm((f) => ({ ...f, color: "black" }))
                }
              >
                Black
              </button>
            </div>
          </label>
          <label className="field">
            <span className="field-label">PGN</span>
            <textarea
              className="text-input"
              rows={10}
              placeholder="1. e4 e5 2. Nf3 ..."
              value={importForm.pgn}
              onChange={(e) =>
                setImportForm((f) => ({ ...f, pgn: e.target.value }))
              }
            />
          </label>
          {importError && (
            <p className="muted small profile-msg err">{importError}</p>
          )}
          <button className="primary" onClick={handleImport}>
            Save game
          </button>
        </div>
      </div>
    );
  }

  if (view === "manual-list") {
    return (
      <div className="page">
        <div className="row">
          <button className="link" onClick={() => setView("main")}>
            {t("common.back")}
          </button>
          <h3 className="section-label">Manual games</h3>
        </div>
        {manualGames.length === 0 ? (
          <p className="muted">No manual games yet.</p>
        ) : (
          <ul className="list">
            {manualGames.map((g) => (
              <li key={g.id} className="line-row">
                <span className="line-open">
                  <input
                    className="text-input"
                    defaultValue={g.opponent}
                    onBlur={(e) => renameManual(g.id, e.target.value)}
                  />
                  <span className="muted small">
                    {" "}· {g.color} · {g.moves.length} plies
                  </span>
                </span>
                <button
                  className="link small"
                  onClick={() => deleteManual(g.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (view === "fix-mistakes") {
    const deviations = reports.flatMap((r) =>
      r.deviations.map((d) => ({
        studyId: r.study.id,
        studyName: r.study.name,
        orientation: r.study.orientation,
        ...d,
      })),
    );
    return (
      <MistakesMode
        deviations={deviations}
        settings={settings}
        onBack={() => setView("main")}
      />
    );
  }

  // --- Main view ---
  const configured =
    (lichessUser || chesscomUser) && settings.importSince;
  const hasAny = (games?.length ?? 0) > 0 || manualGames.length > 0;

  return (
    <div className="page">
      <div className="row">
        <h2>{t("rg.title")}</h2>
        {configured && (
          <button className="primary" disabled={loading} onClick={fetchNow}>
            {loading ? t("rg.fetching") : t("rg.fetch")}
          </button>
        )}
      </div>

      <div className="row">
        <button onClick={() => setView("import")}>Import manual game</button>
        <button onClick={() => setView("manual-list")}>
          See manual games ({manualGames.length})
        </button>
        <button
          className="primary"
          disabled={
            reports.flatMap((r) => r.deviations).length === 0
          }
          onClick={() => setView("fix-mistakes")}
        >
          Fix your mistakes
        </button>
      </div>

      {!configured && manualGames.length === 0 && (
        <div className="row">
          <p className="muted small">
            Configure Lichess / Chess.com in Settings to fetch online games,
            or import a PGN above.
          </p>
          <button className="link" onClick={onSettings}>
            {t("nav.settings")}
          </button>
        </div>
      )}

      {hasAny && (
        <p className="muted small">
          {t("rg.loaded", {
            n: (games?.length ?? 0) + manualGames.length,
          })}
        </p>
      )}
      {error && <p className="result wrong">{error}</p>}

      {studies.length > 1 && (
        <select
          className="select"
          value={filterStudyId}
          onChange={(e) => setFilterStudyId(e.target.value)}
        >
          <option value="">All repertoires</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {hasAny && filtered.length === 0 && (
        <p className="muted">{t("rg.noGames")}</p>
      )}

      {filtered.map((r) => (
        <section key={r.study.id} className="study-card">
          <div className="list-title">{r.study.name}</div>

          {r.deviations.length > 0 && (
            <>
              <h3 className="section-label">
                {t("rg.deviationsN", { n: r.deviations.length })}
              </h3>
              <ul className="list">
                {r.deviations.map((d) => (
                  <li key={d.game.id} className="line-row">
                    <span className="line-open">
                      {t("rg.deviatedAt", {
                        n: d.fullmove,
                        played: d.played,
                        expected: d.expected.join(", "),
                      })}
                      <span className="muted small">
                        {" "}· {t("rg.vs", { opp: d.game.opponent })}
                      </span>
                    </span>
                    {d.game.url && (
                      <a
                        className="analyze-link"
                        href={d.game.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("rg.view")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {r.followed.length > 0 && (
            <>
              <h3 className="section-label">
                {t("rg.followedN", { n: r.followed.length })}
              </h3>
              <ul className="list">
                {r.followed.map((g) => (
                  <li key={g.id} className="line-row">
                    <span className="line-open">
                      {t("rg.vs", { opp: g.opponent })}
                      <span className="muted small"> · {g.speed}</span>
                    </span>
                    {g.url && (
                      <a
                        className="analyze-link"
                        href={g.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t("rg.view")}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
