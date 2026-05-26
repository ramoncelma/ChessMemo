import { useState } from "react";
import { buildCards, chapterNameFromPgn, studyNameFromPgn } from "../pgn";
import { SAMPLE_PGN } from "../sample";
import type { Card, Chapter, Orientation, Study } from "../types";

interface Props {
  studies: Study[];
  addStudy: (study: Study) => void;
  addChapter: (id: string, chapter: Chapter, cards: Card[]) => void;
  renameStudy: (id: string, name: string) => void;
  renameChapter: (id: string, idx: number, name: string) => void;
  removeStudy: (id: string) => void;
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
  onDone,
}: Props) {
  const [target, setTarget] = useState<"new" | string>("new");
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [pgn, setPgn] = useState("");
  const [error, setError] = useState<string | null>(null);

  const existing = studies.find((s) => s.id === target);
  const isNew = target === "new";

  function submit() {
    setError(null);
    const text = pgn.trim();
    if (!text) {
      setError("Paste a PGN first.");
      return;
    }
    const side = isNew ? orientation : (existing?.orientation ?? "white");
    const chapterIdx = isNew ? 0 : (existing?.chapters.length ?? 0);
    let cards: Card[];
    try {
      cards = buildCards(text, side, chapterIdx);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that PGN.");
      return;
    }
    if (cards.length === 0) {
      setError("No moves found for your side — try the other colour.");
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
        createdAt: Date.now(),
        cards,
      });
    } else if (existing) {
      addChapter(existing.id, chapter, cards);
    }
    setPgn("");
    setName("");
    onDone();
  }

  return (
    <div className="page">
      <div className="row">
        <h2>Import PGN</h2>
        <button className="link" onClick={onDone}>
          Done
        </button>
      </div>

      <section>
        <h3 className="section-label">Add to</h3>
        <select
          className="select"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="new">＋ New opening</option>
          {studies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.orientation})
            </option>
          ))}
        </select>
      </section>

      {isNew ? (
        <>
          <section>
            <h3 className="section-label">Opening name</h3>
            <input
              className="text-input"
              placeholder="e.g. Vienna Gambit (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </section>
          <section>
            <h3 className="section-label">Your side</h3>
            <div className="seg">
              <button
                className={orientation === "white" ? "active" : ""}
                onClick={() => setOrientation("white")}
              >
                White
              </button>
              <button
                className={orientation === "black" ? "active" : ""}
                onClick={() => setOrientation("black")}
              >
                Black
              </button>
            </div>
          </section>
        </>
      ) : (
        <p className="muted small">
          New positions will be added to <b>{existing?.name}</b> (plays{" "}
          {existing?.orientation}). Existing progress is kept.
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
          Use sample
        </button>
        <button className="primary" onClick={submit}>
          {isNew ? "Create opening" : "Add to opening"}
        </button>
      </div>

      {studies.length > 0 && (
        <section>
          <h3 className="section-label">Manage openings</h3>
          <ul className="list">
            {studies.map((s) => (
              <li key={s.id} className="study-card">
                <div className="study-head">
                  <div className="list-title">{s.name}</div>
                  <div className="list-aside">
                    <button
                      className="link small"
                      onClick={() => {
                        const next = prompt("Rename opening", s.name);
                        if (next && next.trim()) renameStudy(s.id, next.trim());
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="link danger small"
                      onClick={() => {
                        if (confirm(`Delete "${s.name}"?`)) removeStudy(s.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <ul className="chapter-list">
                  {s.chapters.map((ch, i) => (
                    <li key={i} className="chapter-row">
                      <span className="muted small">{ch.name}</span>
                      <button
                        className="link small"
                        onClick={() => {
                          const next = prompt("Rename chapter", ch.name);
                          if (next && next.trim())
                            renameChapter(s.id, i, next.trim());
                        }}
                      >
                        Rename
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
