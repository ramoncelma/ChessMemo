import { useState } from "react";
import { buildCards, studyNameFromPgn } from "../pgn";
import { SAMPLE_PGN } from "../sample";
import type { Orientation, Study } from "../types";

interface Props {
  addStudy: (study: Study) => void;
  onAdded: () => void;
  onCancel: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function Import({ addStudy, onAdded, onCancel }: Props) {
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
        setError("No moves found for your chosen side — try the other colour.");
        return;
      }
      addStudy({
        id: uuid(),
        name: studyNameFromPgn(text, "Untitled opening"),
        orientation,
        pgn: text,
        createdAt: Date.now(),
        cards,
      });
      setPgn("");
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that PGN.");
    }
  }

  return (
    <div className="page">
      <div className="row">
        <h2>Add an opening</h2>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p className="muted">
        Paste a PGN (mainline and variations). ChessMemo turns your side's
        moves into positions to train, and keeps every line for reading.
      </p>

      <div>
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
      </div>

      <textarea
        className="pgn-input"
        placeholder="1. e4 e5 2. Nf3 ..."
        value={pgn}
        onChange={(e) => setPgn(e.target.value)}
        rows={10}
      />

      {error && <p className="result wrong">{error}</p>}

      <div className="row">
        <button className="link" onClick={() => setPgn(SAMPLE_PGN)}>
          Use sample
        </button>
        <button className="primary" onClick={submit}>
          Create opening
        </button>
      </div>
    </div>
  );
}
