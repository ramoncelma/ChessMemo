import type { Orientation } from "./types";

// Build a Lichess analysis URL for a position reached by a list of SAN moves.
// Example: ["e4","c5","Nf3"] -> https://lichess.org/analysis/pgn/e4_c5_Nf3?color=black#3
// Lichess provides the engine analysis and "play vs computer" from there.
export function lichessAnalysisUrl(
  line: string,
  color: Orientation,
): string {
  const moves = line.split(/\s+/).filter(Boolean);
  const base = "https://lichess.org/analysis";
  if (moves.length === 0) return `${base}?color=${color}`;
  const path = moves.map(encodeURIComponent).join("_");
  return `${base}/pgn/${path}?color=${color}#${moves.length}`;
}
