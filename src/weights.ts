import type { Line, Study } from "./types";

export interface MastersData {
  total: number;
  counts: Map<string, number>; // normalised SAN -> games-played count
}

const cache = new Map<string, MastersData | null>();

// Strip check / mate / annotation glyphs so chess.js SAN ("Nf3+", "Qe2!?")
// and the masters-explorer SAN compare cleanly.
function normSan(san: string): string {
  return san.replace(/[+#!?]/g, "");
}

export async function fetchMasters(fen: string): Promise<MastersData | null> {
  if (cache.has(fen)) return cache.get(fen) ?? null;
  try {
    // moves=50 covers virtually every theoretical reply; the default of 12
    // silently drops anything outside the most popular dozen, which used to
    // make many of our lines look like zero-frequency theory.
    const r = await fetch(
      `https://explorer.lichess.ovh/masters?moves=50&fen=${encodeURIComponent(fen)}`,
    );
    if (!r.ok) {
      cache.set(fen, null);
      return null;
    }
    const data = await r.json();
    const total =
      (data.white || 0) + (data.draws || 0) + (data.black || 0);
    const counts = new Map<string, number>();
    for (const m of data.moves || []) {
      const c = (m.white || 0) + (m.draws || 0) + (m.black || 0);
      counts.set(normSan(m.san), c);
    }
    const result = { total, counts };
    cache.set(fen, result);
    return result;
  } catch {
    cache.set(fen, null);
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Compute master-frequency weights for every line in a study. Within each
// chapter the weights are normalised to sum to 100. Calls Lichess masters
// explorer for every unique position along every line (with caching).
export async function computeStudyWeights(
  study: Study,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> {
  // Unique fens to fetch (each move's fenBefore).
  const fens = new Set<string>();
  for (const line of study.lines)
    for (const m of line.moves) fens.add(m.fenBefore);

  const fenList = [...fens];
  let i = 0;
  for (const fen of fenList) {
    if (!cache.has(fen)) {
      await fetchMasters(fen);
      await sleep(150); // be polite
    }
    i++;
    onProgress?.(i, fenList.length);
  }

  // Raw product per line. Once we run out of masters data (deep theory the
  // explorer no longer covers), stop the product instead of zeroing it —
  // otherwise every line that goes one ply past book ends up at 0% and the
  // chapter collapses to "all low weights".
  const rawByLine = new Map<string, number>();
  for (const line of study.lines) {
    let p = 1;
    let anyMatched = false;
    for (const m of line.moves) {
      const data = cache.get(m.fenBefore);
      if (!data || data.total === 0) break;
      const c = data.counts.get(normSan(m.san)) ?? 0;
      if (c === 0) break;
      p *= c / data.total;
      anyMatched = true;
    }
    rawByLine.set(line.id, anyMatched ? p : 0);
  }

  // Normalise within each chapter so weights sum to 100.
  const byChapter = new Map<number, Line[]>();
  for (const l of study.lines) {
    const list = byChapter.get(l.chapterIdx) ?? [];
    list.push(l);
    byChapter.set(l.chapterIdx, list);
  }
  const result = new Map<string, number>();
  for (const lines of byChapter.values()) {
    const sum = lines.reduce((s, l) => s + (rawByLine.get(l.id) ?? 0), 0);
    if (sum === 0) {
      for (const l of lines) result.set(l.id, 0);
    } else {
      for (const l of lines)
        result.set(l.id, ((rawByLine.get(l.id) ?? 0) / sum) * 100);
    }
  }
  return result;
}

// Chapter-level weight = the chapter's share within the repertoire, based on
// the same raw products.
export function chapterShares(study: Study): Map<number, number> {
  const rawByChapter = new Map<number, number>();
  for (const l of study.lines) {
    const raw = (l.weight ?? 0); // approximation: use stored line weights' chapter sum after normalisation, all chapters sum to 100*n_chapters
    rawByChapter.set(
      l.chapterIdx,
      (rawByChapter.get(l.chapterIdx) ?? 0) + raw,
    );
  }
  const total = [...rawByChapter.values()].reduce((s, x) => s + x, 0);
  const out = new Map<number, number>();
  if (total === 0) return out;
  for (const [idx, sum] of rawByChapter) out.set(idx, (sum / total) * 100);
  return out;
}
