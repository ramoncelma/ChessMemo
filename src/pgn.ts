import { Chess } from "chess.js";
import { newCard } from "./srs";
import type { Card, Orientation } from "./types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Turn the mainline of a PGN into recall cards for the trainee's side.
export function buildCards(pgn: string, orientation: Orientation): Card[] {
  const game = new Chess();
  game.loadPgn(pgn); // throws on invalid PGN
  const moves = game.history({ verbose: true });

  const replay = new Chess();
  const cards: Card[] = [];
  const sanSoFar: string[] = [];

  for (const m of moves) {
    const sideToMove = replay.turn(); // "w" | "b"
    const traineeToMove =
      (orientation === "white" && sideToMove === "w") ||
      (orientation === "black" && sideToMove === "b");

    if (traineeToMove) {
      cards.push({
        id: uuid(),
        fen: replay.fen(),
        answerSan: m.san,
        answerFrom: m.from,
        answerTo: m.to,
        promotion: m.promotion,
        line: sanSoFar.join(" "),
        fsrs: newCard(),
      });
    }

    replay.move(m.san);
    sanSoFar.push(m.san);
  }

  return cards;
}

// A friendly name from the PGN headers, falling back to a default.
export function studyNameFromPgn(pgn: string, fallback: string): string {
  const white = /\[White\s+"([^"]*)"\]/.exec(pgn)?.[1]?.trim();
  const black = /\[Black\s+"([^"]*)"\]/.exec(pgn)?.[1]?.trim();
  const event = /\[Event\s+"([^"]*)"\]/.exec(pgn)?.[1]?.trim();
  if (white && black && white !== "?" && black !== "?") return `${white} – ${black}`;
  if (event && event !== "?") return event;
  return fallback;
}
