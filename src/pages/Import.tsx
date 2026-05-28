import { useState } from "react";
import { buildLines, chapterNameFromPgn, studyNameFromPgn } from "../pgn";
import { SAMPLE_PGN } from "../sample";
import { useT } from "../i18n";
import { SPEEDS, type Speed } from "../settings";
import type { Chapter, Line, Orientation, Study } from "../types";

interface Props {
  studies: Study[];
  addStudy: (study: Study) => void;
  addChapter: (id: string, chapter: Chapter, lines: Line[]) => void;
  renameStudy: (id: string, name: string) => void;
  renameChapter: (id: string, idx: number, name: string) => void;
  removeStudy: (id: string) => void;
  setCategories: (id: string, categories: Speed[]) => void;
  onDone: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function Import({
  studies,
  addStudy,
  addChapter,
  renameStudy,
  renameChapter,
  removeStudy,
  setCategories,
  onDone,
}: Props) {
  const t = useT();
  const [target, setTarget] = useState<"new" | string>("new");
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [cats, setCats] = useState<Record<Speed, boolean>>(() => {
    const o = {} as Record<Speed, boolean>;
    for (const s of SPEEDS) o[s] = true;
    return o;
  });
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const existing = studies.find((s) => s.id === target);
  const isNew = target === "new";

  function submit() {
    setError(null);
    const text = pgn.trim();
    if (!text) {
      setError(t("import.errPaste"));
      return;
    }
    const side = isNew ? orientation : (existing?.orientation ?? "white");
    const chapterIdx = isNew ? 0 : (existing?.chapters.length ?? 0);
    let lines: Line[];
    try {
      lines = buildLines(text, side, chapterIdx);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("import.errInvalid"));
      return;
    }
    if (lines.length === 0) {
      setError(t("import.errNoLines"));
      return;
    }
    const chapter: Chapter = {
      name: chapterNameFromPgn(text, `Chapter ${(existing?.chapters.length ?? 0) + 1}`),
      pgn: text,
    };

    if (isNew) {
      addStudy({
        id: uuid(),
        name: name.trim() || studyNameFromPgn(text, "Untitled opening"),
        orientation: side,
        chapters: [chapter],
        categories: SPEEDS.filter((s) => cats[s]),
        createdAt: Date.now(),
        lines,
      });
    } else if (existing) {
      addChapter(existing.id, chapter, lines);
    }
    setPgn("");
    setName("");
    onDone();
  }

  return (
    <div className="page">
      <div className="row">
        <h2>{t("import.title")}</h2>
        <button className="link" onClick={onDone}>
          {t("common.done")}
        </button>
      </div>

      <p className="muted small">{t("import.intro")}</p>

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

      {isNew ? (
        <>
          <section>
            <h3 className="section-label">{t("import.openingName")}</h3>
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
            <div className="speed-list">
              {SPEEDS.map((sp) => (
                <label key={sp} className="speed-row">
                  <input
                    type="checkbox"
                    checked={cats[sp]}
                    onChange={(e) =>
                      setCats((c) => ({ ...c, [sp]: e.target.checked }))
                    }
                  />
                  {t(`speed.${sp}`)}
                </label>
              ))}
            </div>
          </section>
        </>
      ) : (
        <p className="muted small">
          {t("import.mergeNote", {
            name: existing?.name ?? "",
            side:
              existing?.orientation === "white"
                ? t("common.white")
                : t("common.black"),
          })}
        </p>
      )}

      <textarea
        className="pgn-input"
        placeholder="1. e4 e5 2. Nf3 ..."
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={9}
      />

      {error && <p className="result wrong">{error}</p>}

      <div className="row">
        <button className="link" onClick={() => setPgn(SAMPLE_PGN)}>
          {t("import.useSample")}
        </button>
        <button className="primary" onClick={submit}>
          {isNew ? t("import.create") : t("import.addToOpening")}
        </button>
      </div>

      {studies.length > 0 && (
        <section>
          <h3 className="section-label">{t("import.manage")}</h3>
          <ul className="list">
            {studies.map((s) => (
              <li key={s.id} className="study-card">
                <div className="study-head">
                  <div className="list-title">{s.name}</div>
                  <div className="list-aside">
                    <button
                      className="link small"
                      onClick={() => {
                        const next = prompt(t("import.renamePrompt"), s.name);
                        if (next && next.trim()) renameStudy(s.id, next.trim());
                      }}
                    >
                      {t("common.rename")}
                    </button>
                    <button
                      className="link danger small"
                      onClick={() => {
                        if (confirm(t("import.deleteConfirm", { name: s.name })))
                          removeStudy(s.id);
                      }}
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
                <div className="cat-row">
                  {SPEEDS.map((sp) => {
                    const on = s.categories.includes(sp);
                    return (
                      <label key={sp} className={`cat-chip ${on ? "on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) =>
                            setCategories(
                              s.id,
                              e.target.checked
                                ? [...s.categories, sp]
                                : s.categories.filter((c) => c !== sp),
                            )
                          }
                        />
                        {t(`speed.${sp}`)}
                      </label>
                    );
                  })}
                </div>
                <ul className="chapter-list">
                  {s.chapters.map((ch, i) => (
                    <li key={i} className="chapter-row">
                      <span className="muted small">{ch.name}</span>
                      <button
                        className="link small"
                        onClick={() => {
                          const next = prompt(
                            t("import.renameChapterPrompt"),
                            ch.name,
                          );
                          if (next && next.trim())
                            renameChapter(s.id, i, next.trim());
                        }}
                      >
                        {t("common.rename")}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
