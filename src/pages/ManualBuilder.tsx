import { useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { useT } from "../i18n";
import { SPEEDS, type Settings, type Speed } from "../settings";
import { buildLines, studyNameFromPgn } from "../pgn";
import type { Orientation, Study } from "../types";

interface BuiltMove {
  san: string;
  comment: string;
}

interface Props {
  settings: Settings;
  addStudy: (s: Study) => void;
  onDone: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function ManualBuilder({ settings, addStudy, onDone }: Props) {
  const t = useT();
  const chessRef = useRef(new Chess());
  const [, forceRender] = useState(0);
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [cats, setCats] = useState<Record<Speed, boolean>>(() => {
    const o = {} as Record<Speed, boolean>;
    for (const s of SPEEDS) o[s] = true;
    return o;
  });
  const [moves, setMoves] = useState<BuiltMove[]>([]);
  const [comment, setComment] = useState("");

  const fen = chessRef.current.fen();

  function handleDrop(from: string, to: string): boolean {
    try {
      const m = chessRef.current.move({ from, to, promotion: "q" });
      if (!m) return false;
      // Commit pending comment to previous move, start fresh for the new one.
      setMoves((prev) => {
        const next = [...prev];
        if (next.length > 0 && comment.trim())
          next[next.length - 1] = { ...next[next.length - 1], comment };
        next.push({ san: m.san, comment: "" });
        return next;
      });
      setComment("");
      forceRender((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  }

  function undo() {
    chessRef.current.undo();
    setMoves((prev) => prev.slice(0, -1));
    setComment("");
    forceRender((n) => n + 1);
  }

  function save() {
    if (moves.length === 0) return;
    const finalMoves = [...moves];
    if (finalMoves.length > 0 && comment.trim())
      finalMoves[finalMoves.length - 1] = {
        ...finalMoves[finalMoves.length - 1],
        comment,
      };
    const pgn = buildPgn(finalMoves, name.trim() || "Manual repertoire");
    let lines;
    try {
      lines = buildLines(pgn, orientation, 0);
    } catch {
      return;
    }
    addStudy({
      id: uuid(),
      name: name.trim() || studyNameFromPgn(pgn, "Manual repertoire"),
      orientation,
      chapters: [{ name: "Chapter 1", pgn }],
      categories: SPEEDS.filter((s) => cats[s]),
      createdAt: Date.now(),
      lines,
    });
    onDone();
  }

  const notation = useMemo(() => {
    return moves.map((m, i) => ({
      san: m.san,
      number: i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : null,
      hasComment: !!m.comment,
    }));
  }, [moves]);

  return (
    <div className="page">
      <h2>{t("manual.title")}</h2>

      <section>
        <h3 className="section-label">{t("manual.name")}</h3>
        <input
          className="text-input"
          placeholder={t("import.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </section>

      <section>
        <h3 className="section-label">{t("import.yourSide")}</h3>
        <div className="seg">
          <button
            className={orientation === "white" ? "active" : ""}
            onClick={() => setOrientation("white")}
          >
            {t("common.white")}
          </button>
          <button
            className={orientation === "black" ? "active" : ""}
            onClick={() => setOrientation("black")}
          >
            {t("common.black")}
          </button>
        </div>
      </section>

      <section>
        <h3 className="section-label">{t("settings.gameTypes")}</h3>
        <div className="cat-row">
          {SPEEDS.map((sp) => {
            const on = cats[sp];
            return (
              <label key={sp} className={`cat-chip ${on ? "on" : ""}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setCats((c) => ({ ...c, [sp]: e.target.checked }))
                  }
                />
                {t(`speed.${sp}`)}
              </label>
            );
          })}
        </div>
      </section>

      <Board
        fen={fen}
        orientation={orientation}
        draggable
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
      />

      {moves.length === 0 ? (
        <p className="muted small center-text">{t("manual.empty")}</p>
      ) : (
        <div className="line-notation">
          {notation.map((m, i) => (
            <span key={i}>
              {m.number && <span className="moveno">{m.number}</span>}
              <span className="move">{m.san}</span>
            </span>
          ))}
        </div>
      )}

      <section>
        <h3 className="section-label">{t("manual.comment")}</h3>
        <textarea
          className="pgn-input"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={moves.length === 0}
        />
      </section>

      <div className="row">
        <button className="link" disabled={moves.length === 0} onClick={undo}>
          {t("manual.back")}
        </button>
        <button className="primary" disabled={moves.length === 0} onClick={save}>
          {t("manual.save")}
        </button>
      </div>
    </div>
  );
}

function buildPgn(moves: BuiltMove[], name: string): string {
  let out = `[Event "${name.replace(/"/g, "'")}"]\n[Result "*"]\n\n`;
  let ply = 0;
  for (const m of moves) {
    if (ply % 2 === 0) out += `${ply / 2 + 1}. `;
    out += m.san + " ";
    if (m.comment.trim()) out += `{${m.comment.replace(/[{}]/g, "")}} `;
    ply++;
  }
  out += "*";
  return out;
}
