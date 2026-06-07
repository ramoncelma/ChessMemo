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
  onClick?: () => void;
}

// Two compact tags side-by-side: GM probability + Lichess probability,
// each with the leaf W/D/B percentages underneath. Renders nothing if
// neither weight has been computed yet (e.g. fresh chapter before the
// background scheduler has reached it).
export function WeightTags({
  weight,
  weightLichess,
  gmWdb,
  lichessWdb,
  onClick,
}: Props) {
  if (weight === undefined && weightLichess === undefined) return null;
  const Wrapper: keyof JSX.IntrinsicElements = onClick ? "button" : "span";
  const wrapperProps = onClick
    ? { onClick, className: "weight-tags weight-tags-btn", title: "Click for details" }
    : { className: "weight-tags" };
  const gmTxt = fmtWdb(gmWdb);
  const liTxt = fmtWdb(lichessWdb);
  return (
    <Wrapper {...wrapperProps}>
      <span className="weight-tag-pair">
        <span className="weight-src">GM</span>
        <span>{fmtPct(weight)}</span>
        {weight !== undefined && weight > 0 && (
          <span className="muted small"> · {oneIn(weight)}</span>
        )}
        {gmTxt && <span className="wdb muted small"> · {gmTxt}</span>}
      </span>
      <span className="weight-tag-pair">
        <span className="weight-src">Li</span>
        <span>{fmtPct(weightLichess)}</span>
        {weightLichess !== undefined && weightLichess > 0 && (
          <span className="muted small"> · {oneIn(weightLichess)}</span>
        )}
        {liTxt && <span className="wdb muted small"> · {liTxt}</span>}
      </span>
    </Wrapper>
  );
}
