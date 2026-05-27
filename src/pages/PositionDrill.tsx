import { useEffect, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { resetLevel } from "../srs";
import { useT } from "../i18n";
import { type PositionItem } from "../useStudies";
import type { Line, Study } from "../types";
import type { Settings } from "../settings";

interface Props {
  positions: PositionItem[];
  studies: Study[];
  settings: Settings;
  updateLine: (studyId: string, line: Line) => void;
  onDone: () => void;
}

type Phase = "awaiting" | "correct" | "wrong";

export function PositionDrill({
  positions,
  studies,
  settings,
  updateLine,
  onDone,
}: Props) {
  const t = useT();
  const [queue] = useState<PositionItem[]>(() => positions);
  const [index, setIndex] = useState(0);
  const [backlog, setBacklog] = useState<PositionItem[]>([]);
  const [phase, setPhase] = useState<Phase>("awaiting");
  const [hinted, setHinted] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [cleanCount, setCleanCount] = useState(0);

  const inMain = index < queue.length;
  const current = inMain ? queue[index] : (backlog[0] ?? null);

  useEffect(() => {
    if (phase !== "correct") return;
    const t = setTimeout(() => resolve(true), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, backlog]);

  if (!current) {
    const pct = answered ? Math.round((cleanCount / answered) * 100) : 0;
    return (
      <div className="page center">
        <div className="done-card">
          <div className="done-emoji">🎯</div>
          <h2>{t("drill.sessionComplete")}</h2>
          <p className="muted">
            {answered
              ? t("drill.posSummary", { n: answered, pct })
              : t("drill.posSummary0", { n: answered })}
          </p>
          <button className="primary big" onClick={onDone}>
            {t("common.backHome")}
          </button>
        </div>
      </div>
    );
  }

  const fen =
    phase === "awaiting"
      ? current.fenBefore
      : (() => {
          const p = new Chess(current.fenBefore);
          p.move({ from: current.from, to: current.to, promotion: "q" });
          return p.fen();
        })();

  function resolve(success: boolean) {
    const clean = success && !hinted;
    const item = current!;

    if (inMain) {
      // No scheduling effect by default. Optionally a miss resets the whole
      // line to the start of the cycle.
      if (!clean && settings.positionMissResetsLine) {
        const study = studies.find((s) => s.id === item.studyId);
        const line = study?.lines.find((l) => l.id === item.lineId);
        if (study && line) {
          updateLine(study.id, {
            ...line,
            attempts: line.attempts + 1,
            misses: line.misses + 1,
            sched: resetLevel(),
          });
        }
      }
      if (!clean) setBacklog((b) => [...b, item]);
      setIndex((i) => i + 1);
      setAnswered((n) => n + 1);
      if (clean) setCleanCount((n) => n + 1);
    } else {
      setBacklog((b) => (clean ? b.slice(1) : [...b.slice(1), b[0]]));
    }
    setHinted(false);
    setPhase("awaiting");
  }

  function handleDrop(from: string, to: string): boolean {
    if (phase !== "awaiting") return false;
    const probe = new Chess(current!.fenBefore);
    try {
      probe.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    setPhase(from === current!.from && to === current!.to ? "correct" : "wrong");
    return true;
  }

  const total = queue.length;
  const progress = inMain ? (index / total) * 100 : 100;

  return (
    <div className="page drill">
      <div className="drill-top">
        <button className="icon-btn" onClick={onDone} aria-label="End session">
          ✕
        </button>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="counter">
          {inMain ? `${index + 1}/${total}` : `↻${backlog.length}`}
        </span>
      </div>

      <div className="line-context">{t("drill.guessMove")}</div>

      <Board
        fen={fen}
        orientation={current.orientation}
        draggable={phase === "awaiting"}
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
        hintSquare={hinted && phase === "awaiting" ? current.from : undefined}
      />

      <div className="drill-status">
        {phase === "awaiting" && (
          <div className="awaiting-row">
            <span className="turn-pill">
              {t("drill.toMove", {
                side: current.orientation === "white" ? t("common.white") : t("common.black"),
              })}
            </span>
            <button
              className="hint-btn"
              disabled={hinted}
              onClick={() => setHinted(true)}
            >
              {hinted ? t("drill.hintShown") : t("drill.hint")}
            </button>
          </div>
        )}
        {phase === "correct" && (
          <span className={`result ${hinted ? "wrong" : "correct"}`}>
            {hinted ? "•" : "✓"} {current.san}
          </span>
        )}
        {phase === "wrong" && (
          <div className="wrong-block">
            <span className="result wrong">
              ✕ {t("drill.bestMove")} <b>{current.san}</b>
            </span>
            <button className="primary big" onClick={() => resolve(false)}>
              {t("drill.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
