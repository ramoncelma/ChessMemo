import { useState } from "react";
import { buildCards, studyNameFromPgn } from "../pgn";
import { SAMPLE_PGN } from "../sample";
import { CATEGORY_LABELS, type Category, type Orientation, type Study } from "../types";

interface Props {
  addStudy: (study: Study) => void;
  onAdded: () => void;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const CATEGORIES: Category[] = ["opening", "tactic", "endgame"];

export function Import({ addStudy, onAdded }: Props) {
  const [pgn, setPgn] = useState("");
  const [category, setCategory] = useState<Category>("opening");
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
        name: studyNameFromPgn(text, "Untitled"),
        category,
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
      <h2>Add a line</h2>
      <p className="muted">
        Paste a PGN. ChessMemo turns your side's moves into positions to train.
      </p>

      <div>
        <h3 className="section-label">Category</h3>
        <div className="seg">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

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
        rows={9}
      />

      {error && <p className="result wrong">{error}</p>}

      <div className="row">
        <button className="link" onClick={() => setPgn(SAMPLE_PGN)}>
          Use sample
        </button>
        <button className="primary" onClick={submit}>
          Create line
        </button>
      </div>
    </div>
  );
}
