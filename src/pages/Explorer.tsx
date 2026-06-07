import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import {
  ensureLichessCacheLoaded,
  ensureMastersCacheLoaded,
  fetchLichess,
  fetchMasters,
  type MastersData,
  type MoveWdb,
} from "../weights";
import { ensureEngineCacheLoaded, lookupEval, type CachedEval } from "../engineCache";
import { lichessAnalysisUrl } from "../lichess";
import type { Settings } from "../settings";
import type { Orientation, Study } from "../types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface Props {
  studies: Study[];
  settings: Settings;
  // Optional deep link from Read: which repertoire to pre-select and
  // which SAN sequence to apply when the tab opens.
  initial?: { studyId: string; sans: string[] };
  // Clears the initial state after consumption so subsequent tab visits
  // don't keep snapping back to the deep-link path.
  onInitialApplied?: () => void;
}

interface PathStep {
  san: string;
  fenBefore: string;
  fenAfter: string;
}

function normSan(s: string): string {
  return s.replace(/[+#!?]/g, "");
}

export function Explorer({ studies, settings, initial, onInitialApplied }: Props) {
  const [studyId, setStudyId] = useState<string>(
    initial?.studyId ?? studies[0]?.id ?? "",
  );
  const [path, setPath] = useState<PathStep[]>([]);

  // Apply the deep link once. Resolving SANs requires chess.js so we do it
  // here rather than in initial state, which gives us a clear error path
  // if the incoming list of SANs is malformed.
  useEffect(() => {
    if (!initial) return;
    const ch = new Chess();
    const steps: PathStep[] = [];
    let ok = true;
    for (const san of initial.sans) {
      const before = ch.fen();
      try {
        const m = ch.move(san);
        if (!m) {
          ok = false;
          break;
        }
        steps.push({ san: m.san, fenBefore: before, fenAfter: ch.fen() });
      } catch {
        ok = false;
        break;
      }
    }
    if (ok) {
      setStudyId(initial.studyId);
      setPath(steps);
    }
    onInitialApplied?.();
    // We only want to apply the deep link on mount / when it changes —
    // not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.studyId, initial?.sans?.join(",")]);

  const study = studies.find((s) => s.id === studyId) ?? null;
  const orientation: Orientation = study?.orientation ?? "white";
  const fen = path.length > 0 ? path[path.length - 1].fenAfter : START_FEN;
  const sans = path.map((p) => p.san).join(" ");

  function tryDrop(from: string, to: string): boolean {
    try {
      const ch = new Chess(fen);
      const before = ch.fen();
      const m = ch.move({ from, to, promotion: "q" });
      if (!m) return false;
      setPath((p) => [...p, { san: m.san, fenBefore: before, fenAfter: ch.fen() }]);
      return true;
    } catch {
      return false;
    }
  }

  function playSan(san: string) {
    try {
      const ch = new Chess(fen);
      const before = ch.fen();
      const m = ch.move(san);
      if (!m) return;
      setPath((p) => [...p, { san: m.san, fenBefore: before, fenAfter: ch.fen() }]);
    } catch {
      /* ignore */
    }
  }

  function back() {
    setPath((p) => p.slice(0, -1));
  }
  function reset() {
    setPath([]);
  }

  // SANs that the selected repertoire covers from the current FEN. Computed
  // by walking the repertoire's lines and matching their fenBefore.
  const coveredSans = useMemo(() => {
    if (!study) return new Set<string>();
    const set = new Set<string>();
    for (const line of study.lines) {
      for (const m of line.moves) {
        if (m.fenBefore === fen) set.add(normSan(m.san));
      }
    }
    return set;
  }, [study, fen]);

  return (
    <div className="page explorer-page">
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 6 }}>
          <span className="muted small">Repertoire</span>
          <select
            className="text-input"
            value={studyId}
            onChange={(e) => setStudyId(e.target.value)}
          >
            <option value="">— None —</option>
            {studies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.orientation})
              </option>
            ))}
          </select>
        </label>
        <button onClick={reset} disabled={path.length === 0}>
          Reset
        </button>
        <button onClick={back} disabled={path.length === 0}>
          ◀ Back
        </button>
        <a
          href={lichessAnalysisUrl(sans, orientation)}
          target="_blank"
          rel="noopener noreferrer"
          className="link small"
        >
          Open on Lichess →
        </a>
      </div>

      <div className="explorer-layout">
        <div className="explorer-board">
          <Board
            fen={fen}
            orientation={orientation}
            draggable
            onDrop={tryDrop}
            boardThemeId={settings.boardThemeId}
            pieceSet={settings.pieceSet}
          />
          {sans && <p className="muted small explorer-sans">{sans}</p>}
        </div>
        <div className="explorer-panel">
          <MoveBrowser
            fen={fen}
            coveredSans={coveredSans}
            onPlay={playSan}
            sansForAnalyse={sans}
            orientation={orientation}
          />
        </div>
      </div>
    </div>
  );
}

interface MoveBrowserProps {
  fen: string;
  coveredSans: Set<string>;
  onPlay: (san: string) => void;
  sansForAnalyse: string;
  orientation: Orientation;
}

interface Row {
  san: string;
  gmCount: number;
  gmWdb?: MoveWdb;
  liCount: number;
  liWdb?: MoveWdb;
  inRepertoire: boolean;
}

function MoveBrowser({
  fen,
  coveredSans,
  onPlay,
  sansForAnalyse,
  orientation,
}: MoveBrowserProps) {
  const [gm, setGm] = useState<MastersData | null | "loading">("loading");
  const [li, setLi] = useState<MastersData | null | "loading">("loading");
  const [ev, setEv] = useState<CachedEval | null | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    setGm("loading");
    setLi("loading");
    setEv("loading");
    void Promise.all([
      ensureMastersCacheLoaded(),
      ensureLichessCacheLoaded(),
      ensureEngineCacheLoaded(),
    ]).then(async () => {
      if (cancelled) return;
      const [g, l, e] = await Promise.all([
        fetchMasters(fen),
        fetchLichess(fen),
        lookupEval(fen, 1),
      ]);
      if (cancelled) return;
      setGm(g);
      setLi(l);
      setEv(e);
    });
    return () => {
      cancelled = true;
    };
  }, [fen]);

  const rows = useMemo<Row[]>(() => {
    const gmCounts = gm && gm !== "loading" ? gm.counts : new Map<string, number>();
    const gmMoves = gm && gm !== "loading" ? gm.movesWdb : undefined;
    const liCounts = li && li !== "loading" ? li.counts : new Map<string, number>();
    const liMoves = li && li !== "loading" ? li.movesWdb : undefined;
    const all = new Set<string>([
      ...gmCounts.keys(),
      ...liCounts.keys(),
      ...coveredSans,
    ]);
    const list: Row[] = [];
    for (const san of all) {
      list.push({
        san,
        gmCount: gmCounts.get(san) ?? 0,
        gmWdb: gmMoves?.get(san),
        liCount: liCounts.get(san) ?? 0,
        liWdb: liMoves?.get(san),
        inRepertoire: coveredSans.has(san),
      });
    }
    // Rank by GM popularity, fall back to Lichess popularity.
    list.sort((a, b) => {
      if (a.inRepertoire !== b.inRepertoire) return a.inRepertoire ? -1 : 1;
      const ag = a.gmCount + a.liCount;
      const bg = b.gmCount + b.liCount;
      return bg - ag;
    });
    return list;
  }, [gm, li, coveredSans]);

  const gmTotal = gm && gm !== "loading" ? gm.total : 0;
  const liTotal = li && li !== "loading" ? li.total : 0;

  return (
    <div className="explorer-browser">
      <div className="explorer-totals">
        <span>
          <strong>GM</strong>{" "}
          {gm === "loading"
            ? "loading…"
            : gm === null
              ? "no data"
              : `${gmTotal.toLocaleString()} games · W${pct(gm.white, gmTotal)} D${pct(gm.draws, gmTotal)} B${pct(gm.black, gmTotal)}`}
        </span>
        <span>
          <strong>Li</strong>{" "}
          {li === "loading"
            ? "loading…"
            : li === null
              ? "no data"
              : `${liTotal.toLocaleString()} games · W${pct(li.white, liTotal)} D${pct(li.draws, liTotal)} B${pct(li.black, liTotal)}`}
        </span>
        <span>
          <strong>SF</strong> <EvalCell ev={ev} sans={sansForAnalyse} orientation={orientation} />
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="muted small">No moves recorded at this position.</p>
      ) : (
        <table className="explorer-table">
          <thead>
            <tr>
              <th>Move</th>
              <th title="Games at this position from the GM (Masters) explorer">GM games</th>
              <th>GM W/D/B</th>
              <th title="Games at this position from the Lichess online explorer under your filters">Li games</th>
              <th>Li W/D/B</th>
              <th title="Whether the selected repertoire covers this move">In rep.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.san} className={r.inRepertoire ? "in-rep" : ""}>
                <td>
                  <button className="link" onClick={() => onPlay(r.san)}>
                    {r.san}
                  </button>
                </td>
                <td>{r.gmCount > 0 ? r.gmCount.toLocaleString() : "—"}</td>
                <td>{wdbCell(r.gmWdb)}</td>
                <td>{r.liCount > 0 ? r.liCount.toLocaleString() : "—"}</td>
                <td>{wdbCell(r.liWdb)}</td>
                <td>{r.inRepertoire ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pct(part: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((100 * part) / total)}`;
}

function wdbCell(wdb?: MoveWdb): string {
  if (!wdb) return "—";
  const total = wdb.white + wdb.draws + wdb.black;
  if (total === 0) return "—";
  const w = Math.round((100 * wdb.white) / total);
  const d = Math.round((100 * wdb.draws) / total);
  const b = 100 - w - d;
  return `${w}/${d}/${b}`;
}

function EvalCell({
  ev,
  sans,
  orientation,
}: {
  ev: CachedEval | null | "loading";
  sans: string;
  orientation: Orientation;
}) {
  if (ev === "loading") return <span className="muted small">loading…</span>;
  if (ev === null || ev.notCached)
    return (
      <a
        className="muted small"
        href={lichessAnalysisUrl(sans, orientation)}
        target="_blank"
        rel="noopener noreferrer"
      >
        not cached · analyse →
      </a>
    );
  if (ev.mate !== undefined)
    return (
      <span>
        {ev.mate === 0 ? "#" : `M${ev.mate > 0 ? ev.mate : `−${-ev.mate}`}`}
      </span>
    );
  if (ev.cp !== undefined) {
    const pawns = ev.cp / 100;
    return (
      <span>
        {pawns > 0 ? "+" : ""}
        {pawns.toFixed(2)}
        {ev.depth !== undefined && (
          <span className="muted small"> · d{ev.depth}</span>
        )}
      </span>
    );
  }
  return <span>—</span>;
}
