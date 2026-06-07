import { useEffect, useState } from "react";
import {
  ensureLichessCacheLoaded,
  ensureMastersCacheLoaded,
  fetchLichess,
  fetchMasters,
  lichessFiltersSignature,
  type MastersData,
} from "../weights";
import { ensureEngineCacheLoaded, lookupEval, type CachedEval } from "../engineCache";
import { lichessAnalysisUrl } from "../lichess";
import type { Orientation } from "../types";

interface Props {
  fen: string;
  sans: string;
  orientation: Orientation;
}

// Single-position info panel shown next to the Read board: pulls GM and
// Lichess explorer data for the current FEN (cached if already fetched
// during a weight compute, otherwise opportunistically fetched here), plus
// Stockfish eval. All three update as the user steps through moves.
export function PositionInfo({ fen, sans, orientation }: Props) {
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

  return (
    <div className="position-info">
      <Row label="GM" data={gm} />
      <Row
        label="Li"
        data={li}
        title={`Lichess online · sig: ${lichessFiltersSignature()}`}
      />
      <EvalRow ev={ev} sans={sans} orientation={orientation} />
    </div>
  );
}

function Row({
  label,
  data,
  title,
}: {
  label: string;
  data: MastersData | null | "loading";
  title?: string;
}) {
  if (data === "loading") {
    return (
      <div className="position-info-row" title={title}>
        <span className="weight-src">{label}</span>
        <span className="muted small">loading…</span>
      </div>
    );
  }
  if (data === null || data.total === 0) {
    return (
      <div className="position-info-row" title={title}>
        <span className="weight-src">{label}</span>
        <span className="muted small">no data</span>
      </div>
    );
  }
  const w = Math.round((100 * data.white) / data.total);
  const d = Math.round((100 * data.draws) / data.total);
  const b = 100 - w - d;
  return (
    <div className="position-info-row" title={title}>
      <span className="weight-src">{label}</span>
      <span>{data.total.toLocaleString()} games</span>
      <span className="muted small"> · W{w} D{d} B{b}</span>
    </div>
  );
}

function EvalRow({
  ev,
  sans,
  orientation,
}: {
  ev: CachedEval | null | "loading";
  sans: string;
  orientation: Orientation;
}) {
  if (ev === "loading") {
    return (
      <div className="position-info-row">
        <span className="eval-src">SF</span>
        <span className="muted small">loading…</span>
      </div>
    );
  }
  if (ev === null || ev.notCached) {
    return (
      <div className="position-info-row">
        <span className="eval-src">SF</span>
        <a
          className="muted small"
          href={lichessAnalysisUrl(sans, orientation)}
          target="_blank"
          rel="noopener noreferrer"
          title="Not in Lichess's cloud cache — analyse on Lichess to warm it."
        >
          not cached · analyse →
        </a>
      </div>
    );
  }
  let v: string;
  if (ev.mate !== undefined) {
    v = ev.mate === 0 ? "#" : `M${ev.mate > 0 ? ev.mate : `−${-ev.mate}`}`;
  } else if (ev.cp !== undefined) {
    const pawns = ev.cp / 100;
    v = `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
  } else {
    v = "—";
  }
  return (
    <div className="position-info-row">
      <span className="eval-src">SF</span>
      <span>{v}</span>
      {ev.depth !== undefined && (
        <span className="muted small"> · d{ev.depth}</span>
      )}
    </div>
  );
}
