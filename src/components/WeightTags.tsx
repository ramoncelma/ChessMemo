import type { Wdb } from "../types";

function fmtPct(p: number | undefined): string {
  if (p === undefined) return "—";
  if (p === 0) return "rare";
  if (p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

function fmtWdb(wdb: Wdb | undefined): string {
  if (!wdb || wdb.total === 0) return "";
  const w = Math.round((100 * wdb.w) / wdb.total);
  const d = Math.round((100 * wdb.d) / wdb.total);
  const b = 100 - w - d;
  return `W${w} D${d} B${b}`;
}

function oneIn(p: number): string {
  return `1 in ${Math.max(1, Math.round(100 / p))}`;
}

interface Props {
  weight?: number;
  weightLichess?: number;
  gmWdb?: Wdb;
  lichessWdb?: Wdb;
  // Called with the source whose pill was clicked. When omitted, pills
  // render as non-interactive spans (e.g. the Read line list).
  onClick?: (source: "gm" | "lichess") => void;
  // Which pill (if any) is currently "active" — only used to style the
  // button so the inspector below is visibly tied to the right source.
  activeSource?: "gm" | "lichess" | null;
}

// Two compact tags side-by-side: GM probability + Lichess probability,
// each with the leaf W/D/B percentages underneath. Renders nothing if
// neither weight has been computed yet.
export function WeightTags({
  weight,
  weightLichess,
  gmWdb,
  lichessWdb,
  onClick,
  activeSource,
}: Props) {
  if (weight === undefined && weightLichess === undefined) return null;
  const gmTxt = fmtWdb(gmWdb);
  const liTxt = fmtWdb(lichessWdb);
  return (
    <span className="weight-tags">
      <Pair
        label="GM"
        value={fmtPct(weight)}
        weight={weight}
        wdb={gmTxt}
        onClick={onClick ? () => onClick("gm") : undefined}
        active={activeSource === "gm"}
      />
      <Pair
        label="Li"
        value={fmtPct(weightLichess)}
        weight={weightLichess}
        wdb={liTxt}
        onClick={onClick ? () => onClick("lichess") : undefined}
        active={activeSource === "lichess"}
      />
    </span>
  );
}

function Pair({
  label,
  value,
  weight,
  wdb,
  onClick,
  active,
}: {
  label: string;
  value: string;
  weight?: number;
  wdb: string;
  onClick?: () => void;
  active: boolean;
}) {
  const body = (
    <>
      <span className="weight-src">{label}</span>
      <span>{value}</span>
      {weight !== undefined && weight > 0 && (
        <span className="muted small"> · {oneIn(weight)}</span>
      )}
      {wdb && <span className="wdb muted small"> · {wdb}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        className={`weight-tag-pair weight-tag-pair-btn${active ? " active" : ""}`}
        title="Click for the per-move breakdown"
        onClick={onClick}
      >
        {body}
      </button>
    );
  }
  return <span className="weight-tag-pair">{body}</span>;
}
