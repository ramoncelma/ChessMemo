import { useEffect, useState } from "react";
import { useT } from "../i18n";
import {
  analyzeAll,
  fetchLichessGames,
  loadGames,
  saveGames,
  type RealGame,
  type StudyReport,
} from "../games";
import { SPEEDS } from "../settings";
import type { Settings } from "../settings";
import type { Study } from "../types";

interface Props {
  studies: Study[];
  settings: Settings;
  onSettings: () => void;
}

export function RealGames({ studies, settings, onSettings }: Props) {
  const t = useT();
  const [games, setGames] = useState<RealGame[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGames().then(setGames);
  }, []);

  const configured = settings.lichessUser.trim() && settings.importSince;

  async function fetchNow() {
    setError(null);
    setLoading(true);
    try {
      const since = new Date(settings.importSince).getTime();
      const speeds = SPEEDS.filter((s) => settings.speeds[s]);
      const g = await fetchLichessGames(settings.lichessUser.trim(), since, speeds);
      await saveGames(g);
      setGames(g);
    } catch {
      setError(t("rg.error"));
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return (
      <div className="page center">
        <h2>{t("rg.title")}</h2>
        <p className="muted">{t("rg.needConfig")}</p>
        <button className="primary big" onClick={onSettings}>
          {t("nav.settings")}
        </button>
      </div>
    );
  }

  const reports: StudyReport[] = games ? analyzeAll(studies, games) : [];
  const relevant = reports.filter(
    (r) => r.followed.length > 0 || r.deviations.length > 0,
  );

  return (
    <div className="page">
      <div className="row">
        <h2>{t("rg.title")}</h2>
        <button className="primary" disabled={loading} onClick={fetchNow}>
          {loading ? t("rg.fetching") : t("rg.fetch")}
        </button>
      </div>

      {games && (
        <p className="muted small">{t("rg.loaded", { n: games.length })}</p>
      )}
      {error && <p className="result wrong">{error}</p>}

      {games && relevant.length === 0 && (
        <p className="muted">{t("rg.noGames")}</p>
      )}

      {relevant.map((r) => (
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
                      <span className="muted small"> · {t("rg.vs", { opp: d.game.opponent })}</span>
                    </span>
                    <a
                      className="analyze-link"
                      href={d.game.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("rg.view")}
                    </a>
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
                    <a
                      className="analyze-link"
                      href={g.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("rg.view")}
                    </a>
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
