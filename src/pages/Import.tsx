import { useState } from "react";
import { buildCards, studyNameFromPgn } from "../pgn";
import { SAMPLE_PGN } from "../sample";
import type { Orientation, Study } from "../types";

interface Props {
  addStudy: (study: Study) => void;
  onAdded: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function Import({ addStudy, onAdded }: Props) {
  const [pgn, setPgn] = useState("");
  const [orientation, setOrientation] = useState<Orientation>("white");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const text = pgn.trim();
    if (!text) {
      setError("Paste a PGN first.");
      return;
    }
    try {
      const cards = buildCards(text, orientation);
      if (cards.length === 0) {
        setError("No moves found for your chosen side.");
        return;
      }
      addStudy({
        id: uuid(),
        name: studyNameFromPgn(text, "Untitled study"),
        orientation,
        createdAt: Date.now(),
        cards,
      });
      setPgn("");
      onAdded();
    } catch {
      setError("That doesn't look like valid PGN.");
    }
  }

  return (
    <div className="page">
      <h2>Import a study</h2>
      <p className="muted">
        Paste a PGN of an opening line or game. ChessMemo turns your side's
        moves into recall cards.
      </p>

      <div className="seg">
        <button
          className={orientation === "white" ? "active" : ""}
          onClick={() => setOrientation("white")}
        >
          I play White
        </button>
        <button
          className={orientation === "black" ? "active" : ""}
          onClick={() => setOrientation("black")}
        >
          I play Black
        </button>
      </div>

      <textarea
        className="pgn-input"
        placeholder="1. e4 e5 2. Nf3 ..."
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={10}
      />

      {error && <p className="feedback wrong">{error}</p>}

      <div className="row">
        <button className="link" onClick={() => setPgn(SAMPLE_PGN)}>
          Use sample
        </button>
        <button className="primary" onClick={submit}>
          Create study
        </button>
      </div>
    </div>
  );
}
