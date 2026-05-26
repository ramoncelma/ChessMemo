import { Chess } from "chess.js";

export interface PgnNode {
  san: string;
  from: string;
  to: string;
  promotion?: string;
  color: "w" | "b";
  fenBefore: string;
  fenAfter: string;
  comment?: string;
  children: PgnNode[];
}

// Virtual root: no move, holds the starting position and the first moves.
export interface PgnTree {
  startFen: string;
  children: PgnNode[];
}

const TOKEN =
  /(\{[^}]*\})|([()])|(\$\d+)|(1-0|0-1|1\/2-1\/2|\*)|(\d+\.(?:\.\.)?)|([^\s()]+)/g;

function stripHeaders(pgn: string): string {
  return pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, "");
}

function cleanComment(raw: string): string {
  // Drop the braces and Lichess "[%csl ...]" / "[%cal ...]" drawing annotations.
  return raw
    .slice(1, -1)
    .replace(/\[%[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeSan(token: string): string {
  return token.replace(/[!?]+/g, "");
}

interface Cursor {
  i: number;
}

export function parsePgn(pgn: string): PgnTree {
  const movetext = stripHeaders(pgn);
  const tokens = [...movetext.matchAll(TOKEN)];
  const chess = new Chess();
  const tree: PgnTree = { startFen: chess.fen(), children: [] };

  // A pseudo-node lets the recursion treat first moves like any continuation.
  const rootNode: PgnNode = {
    san: "",
    from: "",
    to: "",
    color: "w",
    fenBefore: chess.fen(),
    fenAfter: chess.fen(),
    children: tree.children,
  };

  parseLevel(tokens, { i: 0 }, chess, rootNode);
  return tree;
}

// All complete root-to-leaf paths through the tree (each is one line).
export function enumerateLines(tree: PgnTree): PgnNode[][] {
  const out: PgnNode[][] = [];
  const walk = (node: PgnNode, prefix: PgnNode[]) => {
    const path = [...prefix, node];
    if (node.children.length === 0) {
      out.push(path);
      return;
    }
    for (const child of node.children) walk(child, path);
  };
  for (const child of tree.children) walk(child, []);
  return out;
}

function parseLevel(
  tokens: RegExpMatchArray[],
  cur: Cursor,
  chess: Chess,
  parent: PgnNode,
): void {
  let last = parent;
  let branchParent = parent;
  let branchFen = chess.fen();

  while (cur.i < tokens.length) {
    const m = tokens[cur.i];
    const [, comment, paren, _nag, _result, _num, move] = m;

    if (paren === ")") {
      cur.i++;
      return;
    }
    if (paren === "(") {
      cur.i++;
      const sub = new Chess(branchFen);
      parseLevel(tokens, cur, sub, branchParent);
      continue;
    }
    if (comment) {
      const c = cleanComment(comment);
      if (c) last.comment = last.comment ? `${last.comment} ${c}` : c;
      cur.i++;
      continue;
    }
    if (move) {
      const san = sanitizeSan(move);
      const fenBefore = chess.fen();
      let mv;
      try {
        mv = chess.move(san);
      } catch {
        throw new Error(`Unexpected move "${move}" in PGN.`);
      }
      const node: PgnNode = {
        san: mv.san,
        from: mv.from,
        to: mv.to,
        promotion: mv.promotion,
        color: mv.color,
        fenBefore,
        fenAfter: chess.fen(),
        children: [],
      };
      last.children.push(node);
      branchParent = last;
      branchFen = fenBefore;
      last = node;
    }
    cur.i++;
  }
}
