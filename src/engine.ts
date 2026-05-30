import { Chess } from "chess.js";

export interface EvalResult {
  cp?: number;
  mate?: number;
  depth?: number;
  pv: string[]; // SAN sequence
}

// Fetch Stockfish evaluation from Lichess's cloud-eval (free, CORS-enabled).
// Returns null if the position isn't in the cloud cache.
export async function fetchEval(fen: string): Promise<EvalResult | null> {
  try {
    const r = await fetch(
      `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}`,
    );
    if (!r.ok) return null;
    const data = await r.json();
    const pv = data.pvs?.[0];
    if (!pv) return null;
    const uciMoves = (pv.moves as string).split(" ").filter(Boolean);
    const ch = new Chess(fen);
    const sans: string[] = [];
    for (const uci of uciMoves) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      try {
        const m = ch.move({ from, to, promotion });
        sans.push(m.san);
      } catch {
        break;
      }
    }
    return {
      cp: pv.cp,
      mate: pv.mate,
      depth: data.depth,
      pv: sans,
    };
  } catch {
    return null;
  }
}
