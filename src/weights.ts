import { get, set } from "idb-keyval";
import type { Study, Wdb } from "./types";

// Bump when the algorithm changes meaningfully OR when a previous build
// stamped studies under a flawed run. useStudies uses this to recompute
// weights for studies stamped with an older version, even if every line
// already has a `weight` value.
export const WEIGHTS_VERSION = 8;

// Position-level explorer data. `white/draws/black` are the per-position
// outcome totals (used for "W36 D37 B27" displays at leaf positions);
// `counts` is the per-move games-played count used for the encounter
// probability product.
export interface MastersData {
  total: number;
  white: number;
  draws: number;
  black: number;
  counts: Map<string, number>;
}

interface CacheValue {
  total: number;
  white?: number; // optional for backward compat with pre-v8 entries
  draws?: number;
  black?: number;
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
        white: value.white ?? 0,
        draws: value.draws ?? 0,
        black: value.black ?? 0,
        counts: new Map(Object.entries(value.counts)),
      });
    }
  });
  return cacheLoaded;
}

// Public alias so UI components can prefetch the IDB cache before reading
// the in-memory `cache` directly (e.g. the per-line weight inspector).
export function ensureMastersCacheLoaded(): Promise<void> {
  return loadCache();
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
      white: v.white,
      draws: v.draws,
      black: v.black,
      counts: Object.fromEntries(v.counts),
    };
  }
  void set(CACHE_KEY, out);
}

// Wipe the in-memory and IDB masters cache. After this, every position will
// be refetched from Lichess on the next compute — used by the manual
// "Refresh GM weights" button to pull in any new master games since the
// last fetch.
export async function clearMastersCache(): Promise<void> {
  cache.clear();
  if (savePending) {
    clearTimeout(savePending);
    savePending = null;
  }
  cacheLoaded = null;
  await set(CACHE_KEY, undefined);
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

// Lichess personal token, kept under its own localStorage key so that no
// settings export / gist sync can ever pick it up. The explorer 401's
// anonymous requests from some regions; sending a token bypasses that.
function getLichessToken(): string | null {
  try {
    const t = (localStorage.getItem("chessmemo.lichessToken") ?? "").trim();
    return t.length ? t : null;
  } catch {
    return null;
  }
}

async function throttledFetch(url: string): Promise<Response | null> {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await sleep(wait);
  let backoff = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    nextAllowedAt = Date.now() + BASE_GAP_MS;
    let res: Response;
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      const token = getLichessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      // - credentials: "omit" prevents any stale lichess.ovh session cookie
      //   from being attached to the request (otherwise Lichess can reply
      //   401 to a request that should be public);
      // - mode: "cors" is the explicit default but forcing it makes the
      //   request unambiguously a simple CORS GET so no preflight runs.
      res = await fetch(url, {
        method: "GET",
        credentials: "omit",
        mode: "cors",
        headers,
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

// Read the GM (Masters explorer) year filter out of the user's saved
// settings. The Settings UI calls clearMastersCache + resetWeightsVersions
// whenever these change, so the cache key can stay FEN-only here.
function getMastersYearFilters(): { since: number | null; until: number | null } {
  try {
    const raw = localStorage.getItem("chessmemo.settings");
    if (!raw) return { since: null, until: null };
    const s = JSON.parse(raw) as Record<string, unknown>;
    const since = typeof s.mastersSinceYear === "number" ? s.mastersSinceYear : null;
    const until = typeof s.mastersUntilYear === "number" ? s.mastersUntilYear : null;
    return { since, until };
  } catch {
    return { since: null, until: null };
  }
}

export async function fetchMasters(fen: string): Promise<MastersData | null> {
  await loadCache();
  const cached = cache.get(fen);
  if (cached === null) return null;
  // Pre-v8 cache entries have total>0 but white/draws/black all zero (the
  // load defaulted missing fields to 0). Treat those as stale and refetch
  // so leaf W/D/B can populate without forcing a full cache wipe.
  if (
    cached !== undefined &&
    !(cached.total > 0 && cached.white + cached.draws + cached.black === 0)
  ) {
    return cached;
  }
  const queryFen = normalizeFenForMasters(fen);
  const { since, until } = getMastersYearFilters();
  let url = `https://explorer.lichess.ovh/masters?moves=50&fen=${encodeURIComponent(queryFen)}`;
  if (since !== null) url += `&since=${since}`;
  if (until !== null) url += `&until=${until}`;
  const r = await throttledFetch(url);
  if (!r || !r.ok) {
    // Don't persist failures — that would lock us out of retrying after a
    // transient outage or a rate-limit window. The in-memory null still
    // dedupes within the session so we don't refetch the same FEN tightly.
    cache.set(fen, null);
    return null;
  }
  const data = await r.json();
  const white = data.white || 0;
  const draws = data.draws || 0;
  const black = data.black || 0;
  const total = white + draws + black;
  const counts = new Map<string, number>();
  for (const m of data.moves || []) {
    const c = (m.white || 0) + (m.draws || 0) + (m.black || 0);
    counts.set(normSan(m.san), c);
  }
  const result: MastersData = { total, white, draws, black, counts };
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

// -----------------------------------------------------------------------
// Lichess online explorer (the second probability source, alongside GM).
// -----------------------------------------------------------------------

// Lichess data shape mirrors MastersData. Stored alongside the GM cache but
// behind a separate key — filters can change, so we don't want a GM cache
// hit to leak into Lichess results.
export type LichessData = MastersData;

interface LichessSettings {
  speeds: string[];
  ratings: number[];
  since: number | null;
  until: number | null;
}

function getLichessSettings(): LichessSettings {
  try {
    const raw = localStorage.getItem("chessmemo.settings");
    if (!raw) return { speeds: [], ratings: [], since: null, until: null };
    const s = JSON.parse(raw) as Record<string, unknown>;
    const speedsObj = (s.lichessSpeeds ?? {}) as Record<string, boolean>;
    const ratingsObj = (s.lichessRatings ?? {}) as Record<string, boolean>;
    return {
      speeds: Object.keys(speedsObj).filter((k) => speedsObj[k]),
      ratings: Object.keys(ratingsObj)
        .filter((k) => ratingsObj[k])
        .map((k) => Number(k))
        .sort((a, b) => a - b),
      since: typeof s.lichessSinceYear === "number" ? s.lichessSinceYear : null,
      until: typeof s.lichessUntilYear === "number" ? s.lichessUntilYear : null,
    };
  } catch {
    return { speeds: [], ratings: [], since: null, until: null };
  }
}

// Stable string used as both cache key and stamp on Study — distinguishes
// computed weights produced under different filter selections.
export function lichessFiltersSignature(s?: LichessSettings): string {
  const f = s ?? getLichessSettings();
  return `s=${f.speeds.join(",")}|r=${f.ratings.join(",")}|y=${f.since ?? ""}-${f.until ?? ""}`;
}

const LICHESS_CACHE_KEY = "chessmemo.lichessCache.v1";
// keyed by `${signature}::${fen}` so changing the filter selection doesn't
// surface stale Lichess data without forcing a full cache wipe.
const lichessCache = new Map<string, LichessData | null>();
let lichessCacheLoaded: Promise<void> | null = null;

function loadLichessCache(): Promise<void> {
  if (lichessCacheLoaded) return lichessCacheLoaded;
  lichessCacheLoaded = get<Record<string, CacheValue>>(LICHESS_CACHE_KEY).then(
    (stored) => {
      if (!stored) return;
      for (const [key, value] of Object.entries(stored)) {
        lichessCache.set(key, {
          total: value.total,
          white: value.white ?? 0,
          draws: value.draws ?? 0,
          black: value.black ?? 0,
          counts: new Map(Object.entries(value.counts)),
        });
      }
    },
  );
  return lichessCacheLoaded;
}

export function ensureLichessCacheLoaded(): Promise<void> {
  return loadLichessCache();
}

let lichessSavePending: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveLichessCache() {
  if (lichessSavePending) return;
  lichessSavePending = setTimeout(() => {
    lichessSavePending = null;
    flushLichessCache();
  }, 500);
}
function flushLichessCache() {
  const out: Record<string, CacheValue> = {};
  for (const [key, v] of lichessCache) {
    if (!v) continue;
    out[key] = {
      total: v.total,
      white: v.white,
      draws: v.draws,
      black: v.black,
      counts: Object.fromEntries(v.counts),
    };
  }
  void set(LICHESS_CACHE_KEY, out);
}

export async function clearLichessCache(): Promise<void> {
  lichessCache.clear();
  if (lichessSavePending) {
    clearTimeout(lichessSavePending);
    lichessSavePending = null;
  }
  lichessCacheLoaded = null;
  await set(LICHESS_CACHE_KEY, undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (lichessSavePending) {
      clearTimeout(lichessSavePending);
      lichessSavePending = null;
    }
    flushLichessCache();
  });
}

export async function fetchLichess(fen: string): Promise<LichessData | null> {
  await loadLichessCache();
  const settings = getLichessSettings();
  const sig = lichessFiltersSignature(settings);
  const key = `${sig}::${fen}`;
  if (lichessCache.has(key)) return lichessCache.get(key) ?? null;

  // No selected speeds or ratings -> the endpoint would return nothing
  // meaningful. Cache null so we don't keep retrying within the session.
  if (settings.speeds.length === 0 || settings.ratings.length === 0) {
    lichessCache.set(key, null);
    return null;
  }

  const queryFen = normalizeFenForMasters(fen);
  const params: string[] = [
    `moves=50`,
    `fen=${encodeURIComponent(queryFen)}`,
    `speeds=${settings.speeds.join(",")}`,
    `ratings=${settings.ratings.join(",")}`,
  ];
  if (settings.since !== null) params.push(`since=${settings.since}`);
  if (settings.until !== null) params.push(`until=${settings.until}`);
  const url = `https://explorer.lichess.ovh/lichess?${params.join("&")}`;

  const r = await throttledFetch(url);
  if (!r || !r.ok) {
    lichessCache.set(key, null);
    return null;
  }
  const data = await r.json();
  const white = data.white || 0;
  const draws = data.draws || 0;
  const black = data.black || 0;
  const total = white + draws + black;
  const counts = new Map<string, number>();
  for (const m of data.moves || []) {
    const c = (m.white || 0) + (m.draws || 0) + (m.black || 0);
    counts.set(normSan(m.san), c);
  }
  const result: LichessData = { total, white, draws, black, counts };
  lichessCache.set(key, result);
  scheduleSaveLichessCache();
  return result;
}

// -----------------------------------------------------------------------
// Dual-source compute. Fetches each unique FEN (opponent positions for the
// product + leaf positions for W/D/B) from BOTH Masters and Lichess in one
// pass, then derives the four per-line outputs.
// -----------------------------------------------------------------------

export interface DualComputeResult {
  weights: Map<string, number>;
  weightsLichess: Map<string, number>;
  gmWdb: Map<string, Wdb>;
  lichessWdb: Map<string, Wdb>;
  totalFens: number;
  withDataGm: number;
  withDataLichess: number;
  stats: FetchStats;
  lichessFiltersSignature: string;
}

function productFor(
  line: { moves: { color: string; san: string; fenBefore: string }[] },
  cacheRef: Map<string, MastersData | null>,
  opponentSide: "w" | "b",
  keyFor: (fen: string) => string,
): number {
  let p = 1;
  let anyMatched = false;
  for (const m of line.moves) {
    if (m.color !== opponentSide) continue;
    const data = cacheRef.get(keyFor(m.fenBefore));
    if (!data || data.total === 0) return 0;
    const c = data.counts.get(normSan(m.san)) ?? 0;
    if (c === 0) return 0;
    p *= c / data.total;
    anyMatched = true;
  }
  return anyMatched ? p * 100 : 0;
}

function wdbFromCache(
  data: MastersData | null | undefined,
): Wdb | undefined {
  if (!data || data.total === 0) return undefined;
  return { w: data.white, d: data.draws, b: data.black, total: data.total };
}

export async function computeStudyWeightsDual(
  study: Study,
  onProgress?: (done: number, total: number, stats: FetchStats) => void,
): Promise<DualComputeResult> {
  await Promise.all([loadCache(), loadLichessCache()]);
  const opponentSide: "w" | "b" = study.orientation === "white" ? "b" : "w";

  const opponentFens = new Set<string>();
  const leafFens = new Set<string>();
  for (const line of study.lines) {
    for (const m of line.moves)
      if (m.color === opponentSide) opponentFens.add(m.fenBefore);
    if (line.moves.length > 0)
      leafFens.add(line.moves[line.moves.length - 1].fenAfter);
  }
  const allFens = new Set<string>([...opponentFens, ...leafFens]);
  const fenList = [...allFens];

  const stats: FetchStats = { fetched: 0, cached: 0, failed: 0 };
  let done = 0;
  let withDataGm = 0;
  let withDataLichess = 0;
  const sig = lichessFiltersSignature();
  const lichessKey = (fen: string) => `${sig}::${fen}`;
  // eslint-disable-next-line no-console
  console.log(
    `[weights] "${study.name}" — ${fenList.length} unique FENs ` +
      `(${opponentFens.size} opponent + ${leafFens.size} leaf), ` +
      `fetching GM + Lichess (sig=${sig})`,
  );
  for (const fen of fenList) {
    const wasCachedGm = cache.has(fen);
    const wasCachedLi = lichessCache.has(lichessKey(fen));
    const [gm, li] = await Promise.all([
      fetchMasters(fen),
      fetchLichess(fen),
    ]);
    if (gm !== null) {
      withDataGm++;
      if (wasCachedGm) stats.cached++;
      else stats.fetched++;
    } else {
      stats.failed++;
    }
    if (li !== null) {
      withDataLichess++;
      if (wasCachedLi) stats.cached++;
      else stats.fetched++;
    } else {
      stats.failed++;
    }
    done++;
    onProgress?.(done, fenList.length, stats);
  }

  const weights = new Map<string, number>();
  const weightsLichess = new Map<string, number>();
  const gmWdb = new Map<string, Wdb>();
  const lichessWdb = new Map<string, Wdb>();

  for (const line of study.lines) {
    weights.set(
      line.id,
      productFor(line, cache, opponentSide, (f) => f),
    );
    weightsLichess.set(
      line.id,
      productFor(line, lichessCache, opponentSide, lichessKey),
    );
    if (line.moves.length > 0) {
      const leaf = line.moves[line.moves.length - 1].fenAfter;
      const g = wdbFromCache(cache.get(leaf));
      const l = wdbFromCache(lichessCache.get(lichessKey(leaf)));
      if (g) gmWdb.set(line.id, g);
      if (l) lichessWdb.set(line.id, l);
    }
  }

  return {
    weights,
    weightsLichess,
    gmWdb,
    lichessWdb,
    totalFens: fenList.length,
    withDataGm,
    withDataLichess,
    stats,
    lichessFiltersSignature: sig,
  };
}
