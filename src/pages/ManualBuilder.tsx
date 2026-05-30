import { useRef, useState } from "react";
import { Chess } from "chess.js";
import { Board } from "../components/Board";
import { useT } from "../i18n";
import { SPEEDS, type Settings, type Speed } from "../settings";
import { buildLines, studyNameFromPgn } from "../pgn";
import {
  mergeTrees,
  treeToPgn,
  type PgnNode,
  type PgnTree,
} from "../pgnTree";
import type { Chapter, Line, Orientation, Study } from "../types";

interface BuiltMove {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  comment: string;
}

interface Props {
  studies: Study[];
  settings: Settings;
  addStudy: (s: Study) => void;
  addChapter: (id: string, chapter: Chapter, lines: Line[]) => void;
  addToChapter: (studyId: string, chapterIdx: number, pgn: string) => void;
  onDone: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function linearToTree(moves: BuiltMove[]): PgnTree {
  const chess = new Chess();
  const startFen = chess.fen();
  const root: { children: PgnNode[] } = { children: [] };
  let parent: { children: PgnNode[] } = root;
  for (const m of moves) {
    const node: PgnNode = {
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      color: m.color,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      comment: m.comment.trim() || undefined,
      children: [],
    };
    parent.children.push(node);
    parent = node;
  }
  return { startFen, children: root.children };
}

function combinedPgn(lines: BuiltMove[][], chapterName: string): string {
  let combined: PgnTree | null = null;
  for (const line of lines) {
    const t = linearToTree(line);
    combined = combined ? mergeTrees(combined, t) : t;
  }
  if (!combined) return `[Event "${chapterName}"]\n[Result "*"]\n\n*`;
  return treeToPgn(combined, chapterName);
}

export function ManualBuilder({
  studies,
  settings,
  addStudy,
  addChapter,
  addToChapter,
  onDone,
}: Props) {
  const t = useT();
  const chessRef = useRef(new Chess());
  const [, forceRender] = useState(0);

  // Target: new study, or existing study (and within it: new chapter or existing chapter).
  const [target, setTarget] = useState<"new" | string>("new");
  const [chapterTarget, setChapterTarget] = useState<"new" | number>("new");
  const existing = studies.find((s) => s.id === target);
  const isNewStudy = target === "new";

  // New-study fields.
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [cats, setCats] = useState<Record<Speed, boolean>>(() => {
    const o = {} as Record<Speed, boolean>;
    for (const s of SPEEDS) o[s] = true;
    return o;
  });
  // Chapter name (used when creating a new chapter).
  const [chapterName, setChapterName] = useState("");

  // Per-line state.
  const [currentLine, setCurrentLine] = useState<BuiltMove[]>([]);
  const [savedLines, setSavedLines] = useState<BuiltMove[][]>([]);
  const [comment, setComment] = useState("");

  const fen = chessRef.current.fen();
  const sideToUse = isNewStudy ? orientation : existing?.orientation ?? "white";

  function handleDrop(from: string, to: string): boolean {
    try {
      const before = chessRef.current.fen();
      const m = chessRef.current.move({ from, to, promotion: "q" });
      if (!m) return false;
      setCurrentLine((prev) => {
        const next = [...prev];
        if (next.length > 0 && comment.trim())
          next[next.length - 1] = { ...next[next.length - 1], comment };
        next.push({
          san: m.san,
          from: m.from,
          to: m.to,
          promotion: m.promotion,
          color: m.color,
          fenBefore: before,
          fenAfter: chessRef.current.fen(),
          comment: "",
        });
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
    setCurrentLine((prev) => prev.slice(0, -1));
    setComment("");
    forceRender((n) => n + 1);
  }

  function saveLine() {
    if (currentLine.length === 0) return;
    const finalLine = [...currentLine];
    if (finalLine.length > 0 && comment.trim())
      finalLine[finalLine.length - 1] = {
        ...finalLine[finalLine.length - 1],
        comment,
      };
    setSavedLines((prev) => [...prev, finalLine]);
    setCurrentLine([]);
    setComment("");
    chessRef.current = new Chess();
    forceRender((n) => n + 1);
  }

  function saveRepertoire() {
    // Snapshot any in-progress line.
    const all = [...savedLines];
    if (currentLine.length > 0) {
      const finalLine = [...currentLine];
      if (finalLine.length > 0 && comment.trim())
        finalLine[finalLine.length - 1] = {
          ...finalLine[finalLine.length - 1],
          comment,
        };
      all.push(finalLine);
    }
    if (all.length === 0) return;

    const chapName =
      chapterName.trim() ||
      (isNewStudy
        ? "Chapter 1"
        : `Chapter ${(existing?.chapters.length ?? 0) + 1}`);
    const pgn = combinedPgn(all, chapName);

    if (isNewStudy) {
      let lines;
      try {
        lines = buildLines(pgn, sideToUse, 0);
      } catch {
        return;
      }
      addStudy({
        id: uuid(),
        name: name.trim() || studyNameFromPgn(pgn, "Manual repertoire"),
        orientation: sideToUse,
        chapters: [{ name: chapName, pgn }],
        categories: SPEEDS.filter((s) => cats[s]),
        createdAt: Date.now(),
        lines,
      });
    } else if (existing) {
      if (chapterTarget === "new") {
        const chapterIdx = existing.chapters.length;
        let lines;
        try {
          lines = buildLines(pgn, sideToUse, chapterIdx);
        } catch {
          return;
        }
        addChapter(existing.id, { name: chapName, pgn }, lines);
      } else {
        addToChapter(existing.id, chapterTarget, pgn);
      }
    }
    onDone();
  }

  return (
    <div className="page">
      <h2>{t("manual.title")}</h2>

      <section>
        <h3 className="section-label">{t("import.addTo")}</h3>
        <select
          className="select"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="new">{t("import.newOpening")}</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </section>

      {!isNewStudy && existing && (
        <section>
          <h3 className="section-label">Chapter</h3>
          <select
            className="select"
            value={String(chapterTarget)}
            onChange={(e) =>
              setChapterTarget(
                e.target.value === "new" ? "new" : Number(e.target.value),
              )
            }
          >
            <option value="new">＋ New chapter</option>
            {existing.chapters.map((c, i) => (
              <option key={i} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {(isNewStudy || (!isNewStudy && chapterTarget === "new")) && (
        <section>
          <h3 className="section-label">Chapter name</h3>
          <input
            className="text-input"
            placeholder="Chapter 1"
            value={chapterName}
            onChange={(e) => setChapterName(e.target.value)}
          />
        </section>
      )}

      {isNewStudy && (
        <>
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
        </>
      )}

      <Board
        fen={fen}
        orientation={sideToUse}
        draggable
        onDrop={handleDrop}
        boardThemeId={settings.boardThemeId}
        pieceSet={settings.pieceSet}
      />

      {currentLine.length === 0 ? (
        <p className="muted small center-text">{t("manual.empty")}</p>
      ) : (
        <div className="line-notation">
          {currentLine.map((m, i) => (
            <span key={i}>
              {i % 2 === 0 && (
                <span className="moveno">{Math.floor(i / 2) + 1}.</span>
              )}
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
          disabled={currentLine.length === 0}
        />
      </section>

      <div className="row">
        <button
          className="link"
          disabled={currentLine.length === 0}
          onClick={undo}
        >
          {t("manual.back")}
        </button>
        <button
          disabled={currentLine.length === 0}
          onClick={saveLine}
          title="Save this line and start another"
        >
          + Save line ({savedLines.length} saved)
        </button>
        <button
          className="primary"
          disabled={savedLines.length === 0 && currentLine.length === 0}
          onClick={saveRepertoire}
        >
          {t("manual.save")}
        </button>
      </div>
    </div>
  );
}
