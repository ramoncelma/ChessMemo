import type { Line } from "./types";

// For each line within a chapter, returns the index of the first move (ply)
// where the line becomes uniquely identifiable among its chapter siblings.
// Plies before that index are shared with at least one other line; plies
// from that index onward are unique to this line.
//
// If a line is a strict prefix of another, its divergence index is its own
// length (everything it has is shared).
export function chapterDivergence(
  lines: Line[],
  chapterIdx: number,
): Map<string, number> {
  const inCh = lines.filter((l) => l.chapterIdx === chapterIdx);
  const out = new Map<string, number>();
  for (const line of inCh) {
    const others = inCh.filter((l) => l.id !== line.id);
    let k = 0;
    for (; k < line.moves.length; k++) {
      const stillShared = others.some(
        (o) =>
          o.moves.length > k &&
          o.moves
            .slice(0, k + 1)
            .every((m, i) => m.san === line.moves[i].san),
      );
      if (!stillShared) break;
    }
    out.set(line.id, k);
  }
  return out;
}
