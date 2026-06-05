import { get, set } from "idb-keyval";
import type { Study } from "./types";

export interface MastersData {
  total: number;
  counts: Map<string, number>; // normalised SAN -> games-played count
}

interface CacheValue {
  total: number;
  counts: Record<string, number>;
}

const CACHE_KEY = "chessmemo.mastersCache";
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
  savePending = setTimeout(() => {
    savePending = null;
    const out: Record<string, CacheValue> = {};
    for (const [fen, v] of cache) {
      if (!v) continue;
      out[fen] = {
        total: v.total,
        counts: Object.fromEntries(v.counts),
      };
    }
    void set(CACHE_KEY, out);
  }, 1500);
}

function normSan(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Polite, queued access to the Lichess masters explorer:
// - one request every BASE_GAP_MS, no bursting;
// - exponential backoff on 429 / 5xx, up to MAX_BACKOFF_MS, capped retries.
const BASE_GAP_MS = 1000;
const MAX_BACKOFF_MS = 60_000;
let nextAllowedAt = 0;

async function throttledFetch(url: string): Promise<Response | null> {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await sleep(wait);
  let backoff = 5000;
  for (let attempt = 0; attempt < 5; attempt++) {
    nextAllowedAt = Date.now() + BASE_GAP_MS;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      continue;
    }
    return res;
  }
  return null;
}

// since=2010 biases the data toward modern theory (Stockfish era) without
// completely discarding the long-tail of historical games.
const SINCE_YEAR = 2010;

export async function fetchMasters(fen: string): Promise<MastersData | null> {
  await loadCache();
  if (cache.has(fen)) return cache.get(fen) ?? null;
  const url = `https://explorer.lichess.ovh/masters?moves=50&since=${SINCE_YEAR}&fen=${encodeURIComponent(fen)}`;
  const r = await throttledFetch(url);
  if (!r || !r.ok) {
    cache.set(fen, null);
    scheduleSaveCache();
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
//
// "1 in X games" can be derived for the UI as round(100 / weight).
//
// When a position runs out of masters data the product stops rather than
// zeroing — preserving the probability of the verified prefix.
export async function computeStudyWeights(
  study: Study,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> {
  const opponentSide: "w" | "b" = study.orientation === "white" ? "b" : "w";

  // Collect every unique opponent-move position. User-move positions don't
  // need queries — their conditional probability is 1.
  const fens = new Set<string>();
  for (const line of study.lines)
    for (const m of line.moves)
      if (m.color === opponentSide) fens.add(m.fenBefore);

  const fenList = [...fens];
  let done = 0;
  for (const fen of fenList) {
    await fetchMasters(fen);
    done++;
    onProgress?.(done, fenList.length);
  }

  const result = new Map<string, number>();
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
    result.set(line.id, anyMatched ? p * 100 : 0);
  }
  return result;
}
