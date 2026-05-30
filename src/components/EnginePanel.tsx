import type { EvalResult } from "../engine";

interface Props {
  evalResult: EvalResult | null | "loading" | "none";
  onAnalyze: () => void;
}

function formatScore(r: EvalResult): string {
  if (r.mate !== undefined) return `M${r.mate}`;
  if (r.cp !== undefined) {
    const sign = r.cp >= 0 ? "+" : "";
    return `${sign}${(r.cp / 100).toFixed(2)}`;
  }
  return "?";
}

export function EnginePanel({ evalResult, onAnalyze }: Props) {
  return (
    <div className="engine-panel">
      <div className="engine-head">
        <span className="muted small">Engine</span>
        <button className="link small" onClick={onAnalyze}>
          Analyze
        </button>
      </div>
      {evalResult === "loading" && <span className="muted small">Analyzing…</span>}
      {evalResult === "none" && (
        <span className="muted small">Position not in cloud cache.</span>
      )}
      {evalResult && typeof evalResult !== "string" && (
        <div className="engine-result">
          <span className="engine-score">{formatScore(evalResult)}</span>
          {evalResult.depth !== undefined && (
            <span className="muted small">d{evalResult.depth}</span>
          )}
          <span className="engine-pv">{evalResult.pv.slice(0, 6).join(" ")}</span>
        </div>
      )}
    </div>
  );
}
