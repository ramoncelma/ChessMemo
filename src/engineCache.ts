import { get, set } from "idb-keyval";
import { fetchEval } from "./engine";

// Per-FEN Stockfish (Lichess Cloud Eval) cache. Two sources of truth:
//   - hits — { cp?, mate?, depth } from the cloud
//   - misses — recorded as `notCached: true` so we don't keep re-hammering
//     the API for positions Lichess has never analysed. The miss is reset
//     by clearEngineCache() (manual refresh) or by the user clicking
//     "Analyse on Lichess" which warms Lichess's cloud for next time.
// The cache value rides the gist sync via MERGE_KEYS, so a no-token device
// reads evals computed elsewhere.

export interface EvalEntry {
  cp?: number;
  mate?: number;
  depth?: number;
  notCached?: boolean;
  fetchedAt: number;
}

const CACHE_KEY = "chessmemo.evalCache.v1";
const cache = new Map<string, EvalEntry>();
let cacheLoaded: Promise<void> | null = null;

function loadCache(): Promise<void> {
  if (cacheLoaded) return cacheLoaded;
  cacheLoaded = get<Record<string, EvalEntry>>(CACHE_KEY).then((stored) => {
    if (!stored) return;
    for (const [fen, value] of Object.entries(stored)) {
      cache.set(fen, value);
    }
  });
  return cacheLoaded;
}

export function ensureEngineCacheLoaded(): Promise<void> {
  return loadCache();
}

let savePending: ReturnType<typeof setTimeout> | null = null;
function scheduleSaveCache() {
  if (savePending) return;
  savePending = setTimeout(() => {
    savePending = null;
    flushCache();
  }, 500);
}

function flushCache() {
  const out: Record<string, EvalEntry> = {};
  for (const [fen, v] of cache) out[fen] = v;
  void set(CACHE_KEY, out);
}

export async function clearEngineCache(): Promise<void> {
  cache.clear();
  if (savePending) {
    clearTimeout(savePending);
    savePending = null;
  }
  cacheLoaded = null;
  await set(CACHE_KEY, undefined);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (savePending) {
      clearTimeout(savePending);
      savePending = null;
    }
    flushCache();
  });
}

// Drop the en-passant target + clocks the same way the explorer fetchers
// do, so two FENs that reach the same position via different move orders
// share one cache entry.
function normalizeFen(fen: string): string {
  const parts = fen.split(" ");
  if (parts.length < 4) return fen;
  return `${parts[0]} ${parts[1]} ${parts[2]} -`;
}

// Lichess Cloud Eval is rate-limited politely; we space requests by 800ms
// (lighter than the explorer's 2s — eval responses are tiny and read-only)
// and cap with exponential backoff on transient failures.
const BASE_GAP_MS = 800;
let nextAllowedAt = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface CachedEval {
  cp?: number;
  mate?: number;
  depth?: number;
  notCached: boolean;
}

export async function lookupEval(
  fen: string,
  multiPv = 1,
): Promise<CachedEval | null> {
  await loadCache();
  const key = normalizeFen(fen);
  const cached = cache.get(key);
  if (cached) {
    return {
      cp: cached.cp,
      mate: cached.mate,
      depth: cached.depth,
      notCached: !!cached.notCached,
    };
  }
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await sleep(wait);
  nextAllowedAt = Date.now() + BASE_GAP_MS;
  const r = await fetchEval(key, multiPv);
  if (r === null) {
    // Lichess says "we don't have this in the cloud". Persist the miss so
    // the scheduler doesn't keep retrying on every reload, but make it
    // resettable via clearEngineCache + per-line evalNotCached flag.
    const entry: EvalEntry = { notCached: true, fetchedAt: Date.now() };
    cache.set(key, entry);
    scheduleSaveCache();
    return { notCached: true };
  }
  const best = r.lines[0];
  const entry: EvalEntry = {
    cp: best?.cp,
    mate: best?.mate,
    depth: r.depth,
    fetchedAt: Date.now(),
  };
  cache.set(key, entry);
  scheduleSaveCache();
  return {
    cp: entry.cp,
    mate: entry.mate,
    depth: entry.depth,
    notCached: false,
  };
}

// Synchronous lookup for UI components that want to render whatever is in
// the in-memory cache without triggering a fetch. Returns null on miss.
export function peekEval(fen: string): CachedEval | null {
  const key = normalizeFen(fen);
  const cached = cache.get(key);
  if (!cached) return null;
  return {
    cp: cached.cp,
    mate: cached.mate,
    depth: cached.depth,
    notCached: !!cached.notCached,
  };
}
