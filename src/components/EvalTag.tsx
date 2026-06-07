import { lichessAnalysisUrl } from "../lichess";

interface Props {
  cp?: number;
  mate?: number;
  depth?: number;
  notCached?: boolean;
  // SAN sequence + orientation used to build the "Analyse on Lichess" link
  // when the position isn't in Lichess's cloud-eval cache yet. Clicking
  // sends the user to the live Lichess analysis board, which warms the
  // cache for next time.
  sansForAnalyse?: string;
  orientation?: "white" | "black";
}

function fmt({ cp, mate }: { cp?: number; mate?: number }): string {
  if (mate !== undefined) {
    if (mate === 0) return "#";
    return `M${mate > 0 ? mate : `−${-mate}`}`;
  }
  if (cp === undefined) return "—";
  // cp is from white's perspective in Lichess Cloud Eval's "side-to-move"
  // convention only for some endpoints; cloud-eval returns side-to-move
  // signed cp. We render with explicit sign so it's clear who's better.
  const pawns = cp / 100;
  const sign = pawns > 0 ? "+" : pawns < 0 ? "" : "";
  return `${sign}${pawns.toFixed(2)}`;
}

export function EvalTag({
  cp,
  mate,
  depth,
  notCached,
  sansForAnalyse,
  orientation,
}: Props) {
  if (notCached) {
    if (sansForAnalyse) {
      return (
        <a
          className="eval-tag eval-tag-link"
          href={lichessAnalysisUrl(sansForAnalyse, orientation ?? "white")}
          target="_blank"
          rel="noopener noreferrer"
          title="Lichess hasn't analysed this position. Click to open it on Lichess — that warms the cloud cache for next time."
        >
          <span className="eval-src">SF</span>
          <span>not cached</span>
        </a>
      );
    }
    return (
      <span className="eval-tag" title="Lichess Cloud Eval has no entry for this position yet.">
        <span className="eval-src">SF</span>
        <span>not cached</span>
      </span>
    );
  }
  if (cp === undefined && mate === undefined) return null;
  return (
    <span
      className="eval-tag"
      title={
        depth !== undefined
          ? `Stockfish (Lichess Cloud Eval) · depth ${depth}`
          : "Stockfish (Lichess Cloud Eval)"
      }
    >
      <span className="eval-src">SF</span>
      <span>{fmt({ cp, mate })}</span>
      {depth !== undefined && (
        <span className="muted small"> · d{depth}</span>
      )}
    </span>
  );
}
