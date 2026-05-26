import { newCard } from "./srs";
import { parsePgn, type PgnNode } from "./pgnTree";
import type { Card, Orientation } from "./types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Turn every line in a PGN (mainline + variations) into recall cards for the
// trainee's side.
export function buildCards(
  pgn: string,
  orientation: Orientation,
  chapterIdx = 0,
): Card[] {
  const tree = parsePgn(pgn); // throws on invalid PGN
  const want = orientation === "white" ? "w" : "b";
  const cards: Card[] = [];
  const seen = new Set<string>();

  const walk = (nodes: PgnNode[], lineSans: string[]) => {
    for (const node of nodes) {
      if (node.color === want) {
        const key = `${node.fenBefore}|${node.san}`;
        if (!seen.has(key)) {
          seen.add(key);
          cards.push({
            id: uuid(),
            fen: node.fenBefore,
            answerSan: node.san,
            answerFrom: node.from,
            answerTo: node.to,
            promotion: node.promotion,
            line: lineSans.join(" "),
            chapterIdx,
            attempts: 0,
            misses: 0,
            fsrs: newCard(),
          });
        }
      }
      walk(node.children, [...lineSans, node.san]);
    }
  };

  walk(tree.children, []);
  return cards;
}

function header(pgn: string, tag: string): string | undefined {
  const v = new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`).exec(pgn)?.[1]?.trim();
  return v && v !== "?" ? v : undefined;
}

export function studyNameFromPgn(pgn: string, fallback: string): string {
  return (
    header(pgn, "Opening") ??
    header(pgn, "StudyName") ??
    header(pgn, "Event") ??
    fallback
  );
}

export function chapterNameFromPgn(pgn: string, fallback: string): string {
  return (
    header(pgn, "ChapterName") ?? header(pgn, "Event") ?? fallback
  );
}
