import { get, set } from "idb-keyval";
import type { Study } from "./types";

// Bump when the algorithm changes meaningfully OR when a previous build
// stamped studies under a flawed run. useStudies uses this to recompute
// weights for studies stamped with an older version, even if every line
// already has a `weight` value.
export const WEIGHTS_VERSION = 6;

export interface MastersData {
  total: number;
  counts: Map<string, number>; // normalised SAN -> games-played count
}

interface CacheValue {
  total: number;
  counts: Record<string, number>;
}

// Bumped to v2: previous entries were queried with chess.js's full FEN
// including en-passant targets and may contain empty responses where the
// position should have data. A fresh key forces a clean rebuild against
// the normalised query path.
const CACHE_KEY = "chessmemo.mastersCache.v2";
const cache = new Map<string, MastersData | null>();
let cacheLoaded: Promise<void> | null = null;

function loadCache(): Promise<void> {
  if (cacheLoaded) return cacheLoaded;
  cacheLoaded = get<Record<string, CacheValue>>(CACHE_KEY).then((stored) => {
    if (!stored) return;
    for (const [fen, value] of Object.entries(stored)) {
      cache.set(fen, {
        total: value.total,
        counts: new Map(Object.entries(value.counts)),
      });
    }
  });
  return cacheLoaded;
}

let savePending: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveCache() {
  if (savePending) return;
  // 500ms — short enough that successful fetches reach IDB even if the user
  // closes the tab during a long compute, but long enough to batch a few
  // adjacent fetches into one write.
  savePending = setTimeout(() => {
    savePending = null;
    flushCache();
  }, 500);
}

function flushCache() {
  const out: Record<string, CacheValue> = {};
  for (const [fen, v] of cache) {
    if (!v) continue;
    out[fen] = {
      total: v.total,
      counts: Object.fromEntries(v.counts),
    };
  }
  void set(CACHE_KEY, out);
}

if (typeof window !== "undefined") {
  // Last-chance flush on tab close so we never lose successful fetches.
  window.addEventListener("beforeunload", () => {
    if (savePending) {
      clearTimeout(savePending);
      savePending = null;
    }
    flushCache();
  });
}

function normSan(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Polite, queued access to the Lichess masters explorer:
// - one request every BASE_GAP_MS, no bursting (2s is conservative; the
//   masters subdomain doesn't publish a per-second limit but anecdotally
//   tightens up around 1 req/s on heavy use);
// - if Lichess sends a 429 with Retry-After, honour it; otherwise use
//   exponential backoff capped at MAX_BACKOFF_MS;
// - cap retries so a long Lichess outage can't stall a whole compute.
const BASE_GAP_MS = 2000;
const MAX_BACKOFF_MS = 60_000;
let nextAllowedAt = 0;

// Per-compute diagnostics. The scheduler reads these to surface fetched /
// cached / failed counts in the status bar.
export interface FetchStats {
  fetched: number;
  cached: number;
  failed: number;
}

let logged401 = false;

async function throttledFetch(url: string): Promise<Response | null> {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await sleep(wait);
  let backoff = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    nextAllowedAt = Date.now() + BASE_GAP_MS;
    let res: Response;
    try {
      // - credentials: "omit" prevents any stale lichess.ovh session cookie
      //   from being attached to the request (otherwise Lichess can reply
      //   401 to a request that should be public);
      // - mode: "cors" is the explicit default but forcing it makes the
      //   request unambiguously a simple CORS GET so no preflight runs;
      // - Accept: application/json is what the explorer returns anyway.
      res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        mode: "cors",
        headers: { Accept: "application/json" },
      });
    } catch {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status === 401 && !logged401) {
      logged401 = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[weights] Lichess returned 401 Unauthorized on the masters explorer. " +
          "If you're logged into Lichess in this browser, try opening this URL " +
          "in a private/incognito window to confirm whether it works without " +
          "your session cookie: " +
          url,
      );
    }
    if (res.status === 429) {
      const ra = res.headers.get("Retry-After");
      const raMs = ra ? Number(ra) * 1000 : NaN;
      const wait = Number.isFinite(raMs) && raMs > 0 ? raMs : backoff;
      await sleep(Math.min(wait, MAX_BACKOFF_MS));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status >= 500) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    return res;
  }
  return null;
}

// Lichess masters indexes positions in a normalised form. We strip:
//   - the en-passant target (chess.js always sets it after a pawn double-
//     step, even when no capture is legal);
//   - the halfmove and fullmove counters (Lichess has been seen to reject
//     well-formed FENs that include them on the explorer endpoint).
// The local cache is still keyed by the original FEN so producers and
// consumers stay in sync end-to-end.
function normalizeFenForMasters(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 4) return fen;
  // Keep only placement, side, castling, en-passant. Force ep to "-".
  return `${parts[0]} ${parts[1]} ${parts[2]} -`;
}

// (Removed the since=2010 filter — using all years dramatically increases the
// chance that every position along a deep mainline returns enough data to
// keep the product non-zero.)

export async function fetchMasters(fen: string): Promise<MastersData | null> {
  await loadCache();
  if (cache.has(fen)) return cache.get(fen) ?? null;
  const queryFen = normalizeFenForMasters(fen);
  const url = `https://explorer.lichess.ovh/masters?moves=50&fen=${encodeURIComponent(queryFen)}`;
  const r = await throttledFetch(url);
  if (!r || !r.ok) {
    // Don't persist failures — that would lock us out of retrying after a
    // transient outage or a rate-limit window. The in-memory null still
    // dedupes within the session so we don't refetch the same FEN tightly.
    cache.set(fen, null);
    return null;
  }
  const data = await r.json();
  const total = (data.white || 0) + (data.draws || 0) + (data.black || 0);
  const counts = new Map<string, number>();
  for (const m of data.moves || []) {
    const c = (m.white || 0) + (m.draws || 0) + (m.black || 0);
    counts.set(normSan(m.san), c);
  }
  const result: MastersData = { total, counts };
  cache.set(fen, result);
  scheduleSaveCache();
  return result;
}

// Compute Expected Encounter Probability per line. The product runs only over
// OPPONENT moves (user moves are fixed in the repertoire and have probability
// 1.0). The result is stored on each line as `weight = rawProbability * 100`,
// i.e. an absolute percentage — NOT a chapter-normalised share.
export interface ComputeResult {
  weights: Map<string, number>;
  totalFens: number;
  withData: number; // FENs that have valid masters data (fresh or cached).
  stats: FetchStats;
}

export async function computeStudyWeights(
  study: Study,
  onProgress?: (done: number, total: number, stats: FetchStats) => void,
): Promise<ComputeResult> {
  await loadCache();
  const opponentSide: "w" | "b" = study.orientation === "white" ? "b" : "w";

  const fens = new Set<string>();
  for (const line of study.lines)
    for (const m of line.moves)
      if (m.color === opponentSide) fens.add(m.fenBefore);

  const fenList = [...fens];
  const stats: FetchStats = { fetched: 0, cached: 0, failed: 0 };
  let done = 0;
  let withData = 0;
  // eslint-disable-next-line no-console
  console.log(
    `[weights] "${study.name}" — ${fenList.length} unique opponent FENs to fetch (opponentSide=${opponentSide})`,
  );
  for (const fen of fenList) {
    const wasCached = cache.has(fen);
    const data = await fetchMasters(fen);
    if (data !== null) {
      withData++;
      if (wasCached) stats.cached++;
      else stats.fetched++;
    } else {
      stats.failed++;
    }
    done++;
    onProgress?.(done, fenList.length, stats);
  }

  const weights = new Map<string, number>();
  let zeroLines = 0;
  for (const line of study.lines) {
    let p = 1;
    let anyMatched = false;
    for (const m of line.moves) {
      if (m.color !== opponentSide) continue;
      const data = cache.get(m.fenBefore);
      if (!data || data.total === 0) break;
      const c = data.counts.get(normSan(m.san)) ?? 0;
      if (c === 0) break;
      p *= c / data.total;
      anyMatched = true;
    }
    const w = anyMatched ? p * 100 : 0;
    weights.set(line.id, w);
    if (w === 0) zeroLines++;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[weights] "${study.name}" done — fenList=${fenList.length}, fetched=${stats.fetched}, cached=${stats.cached}, failed=${stats.failed}, zero-weighted lines=${zeroLines}/${study.lines.length}`,
  );
  return { weights, totalFens: fenList.length, withData, stats };
}

// Per-opponent-move trace for the per-line inspector. The UI shows this when
// the user clicks a line's weight tag, so we can see exactly where the
// product broke (or whether it produced a real number).
export interface WeightTraceStep {
  san: string;
  fenBefore: string;
  ply: number;
  status: "ok" | "no-data-fetched-empty" | "san-not-in-counts" | "no-cache";
  count?: number;
  total?: number;
  conditional?: number;
  cumulative?: number;
}

export function traceLineWeight(
  study: Study,
  lineId: string,
): WeightTraceStep[] {
  const line = study.lines.find((l) => l.id === lineId);
  if (!line) return [];
  const opponentSide: "w" | "b" = study.orientation === "white" ? "b" : "w";
  const steps: WeightTraceStep[] = [];
  let p = 1;
  for (let i = 0; i < line.moves.length; i++) {
    const m = line.moves[i];
    if (m.color !== opponentSide) continue;
    const data = cache.get(m.fenBefore);
    if (!data) {
      steps.push({
        san: m.san,
        fenBefore: m.fenBefore,
        ply: i,
        status: "no-cache",
      });
      break;
    }
    if (data.total === 0) {
      steps.push({
        san: m.san,
        fenBefore: m.fenBefore,
        ply: i,
        status: "no-data-fetched-empty",
        total: 0,
      });
      break;
    }
    const c = data.counts.get(normSan(m.san)) ?? 0;
    if (c === 0) {
      steps.push({
        san: m.san,
        fenBefore: m.fenBefore,
        ply: i,
        status: "san-not-in-counts",
        total: data.total,
        count: 0,
      });
      break;
    }
    const cond = c / data.total;
    p *= cond;
    steps.push({
      san: m.san,
      fenBefore: m.fenBefore,
      ply: i,
      status: "ok",
      count: c,
      total: data.total,
      conditional: cond,
      cumulative: p,
    });
  }
  return steps;
}
