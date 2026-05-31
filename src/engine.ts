import { Chess } from "chess.js";

export interface PvLine {
  cp?: number;
  mate?: number;
  pv: string[]; // SAN sequence
  firstUci?: string; // raw UCI of the first move (for arrow rendering)
  firstSan?: string;
}

export interface EvalResult {
  depth?: number;
  lines: PvLine[];
}

interface RawPv {
  moves: string;
  cp?: number;
  mate?: number;
}

function convertOne(fen: string, uciStr: string): { sans: string[]; firstUci?: string; firstSan?: string } {
  const uciMoves = uciStr.split(" ").filter(Boolean);
  const ch = new Chess(fen);
  const sans: string[] = [];
  let firstSan: string | undefined;
  for (const uci of uciMoves) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
    try {
      const m = ch.move({ from, to, promotion });
      sans.push(m.san);
      if (firstSan === undefined) firstSan = m.san;
    } catch {
      break;
    }
  }
  return { sans, firstUci: uciMoves[0], firstSan };
}

// Fetch Stockfish evaluation from Lichess's cloud-eval (free, CORS-enabled).
// Returns null if the position isn't in the cloud cache.
// Build [from, to, rgba] arrows for the engine's top lines. Opacity for each
// non-best line is scaled by how much its score trails the best (capped at
// 200 cp); the best move is always at full strength. Mate scores are treated
// as the strongest possible.
export function arrowsFromEval(
  result: EvalResult | null,
  turn: "w" | "b",
): [string, string, string][] {
  if (!result) return [];
  const sideMul = turn === "w" ? 1 : -1; // cp is from side-to-move POV
  function score(l: PvLine): number {
    if (l.mate !== undefined) return (l.mate >= 0 ? 1 : -1) * 100_000;
    if (l.cp !== undefined) return l.cp;
    return 0;
  }
  const best = result.lines[0];
  if (!best) return [];
  const bestScore = score(best) * sideMul;
  return result.lines
    .filter((l) => l.firstUci && l.firstUci.length >= 4)
    .map((l, i) => {
      const s = score(l) * sideMul;
      const delta = Math.max(0, bestScore - s);
      const opacity = i === 0 ? 0.9 : Math.max(0.2, 0.9 - delta / 200);
      const color =
        i === 0
          ? `rgba(46, 130, 60, ${opacity})`
          : i === 1
            ? `rgba(200, 145, 30, ${opacity})`
            : `rgba(170, 70, 70, ${opacity})`;
      const uci = l.firstUci!;
      return [uci.slice(0, 2), uci.slice(2, 4), color] as [
        string,
        string,
        string,
      ];
    });
}

export async function fetchEval(
  fen: string,
  multiPv = 1,
): Promise<EvalResult | null> {
  try {
    const r = await fetch(
      `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(
        fen,
      )}&multiPv=${Math.max(1, Math.min(5, multiPv))}`,
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { depth?: number; pvs?: RawPv[] };
    if (!data.pvs || data.pvs.length === 0) return null;
    const lines: PvLine[] = data.pvs.map((pv) => {
      const { sans, firstUci, firstSan } = convertOne(fen, pv.moves);
      return {
        cp: pv.cp,
        mate: pv.mate,
        pv: sans,
        firstUci,
        firstSan,
      };
    });
    return { depth: data.depth, lines };
  } catch {
    return null;
  }
}
