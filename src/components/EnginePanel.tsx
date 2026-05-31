import type { EvalResult, PvLine } from "../engine";

interface Props {
  evalResult: EvalResult | null | "loading" | "none";
  onAnalyze: () => void;
}

function formatScore(l: PvLine): string {
  if (l.mate !== undefined) {
    return l.mate >= 0 ? `#${l.mate}` : `#-${Math.abs(l.mate)}`;
  }
  if (l.cp !== undefined) {
    const sign = l.cp >= 0 ? "+" : "";
    return `${sign}${(l.cp / 100).toFixed(2)}`;
  }
  return "?";
}

export function EnginePanel({ evalResult, onAnalyze }: Props) {
  return (
    <div className="engine-panel">
      <div className="engine-head">
        <span className="muted small">Engine</span>
        {evalResult &&
          typeof evalResult !== "string" &&
          evalResult.depth !== undefined && (
            <span className="engine-depth">Depth {evalResult.depth}</span>
          )}
        <button className="link small" onClick={onAnalyze}>
          Analyze
        </button>
      </div>
      {evalResult === "loading" && (
        <span className="muted small">Analyzing…</span>
      )}
      {evalResult === "none" && (
        <span className="muted small">Position not in cloud cache.</span>
      )}
      {evalResult && typeof evalResult !== "string" && (
        <div className="engine-lines">
          {evalResult.lines.map((line, i) => (
            <div className="engine-line" key={i}>
              <span className={`engine-score line-${i}`}>
                {formatScore(line)}
              </span>
              <span className="engine-pv">
                {line.pv.slice(0, 8).join(" ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
