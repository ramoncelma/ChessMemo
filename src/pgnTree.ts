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

// Merge two PGN trees: at each level, nodes with the same SAN are unified and
// their continuations merged. Comments are preserved (existing wins).
export function mergeTrees(a: PgnTree, b: PgnTree): PgnTree {
  return { startFen: a.startFen, children: mergeChildren(a.children, b.children) };
}

function cloneNode(n: PgnNode): PgnNode {
  return { ...n, children: n.children.map(cloneNode) };
}

function mergeChildren(a: PgnNode[], b: PgnNode[]): PgnNode[] {
  const out: PgnNode[] = a.map(cloneNode);
  for (const bn of b) {
    const match = out.find((x) => x.san === bn.san);
    if (match) {
      match.comment = match.comment || bn.comment;
      match.children = mergeChildren(match.children, bn.children);
    } else {
      out.push(cloneNode(bn));
    }
  }
  return out;
}

// Serialize a tree back to PGN (mainline inline, variations in parentheses).
export function treeToPgn(tree: PgnTree, name: string): string {
  let out = `[Event "${name.replace(/"/g, "'")}"]\n[Result "*"]\n\n`;
  out += writeSeq(tree.children, 0, true).trim();
  out += " *";
  return out;
}

function writeSeq(
  nodes: PgnNode[],
  ply: number,
  startOfLine: boolean,
): string {
  if (nodes.length === 0) return "";
  const main = nodes[0];
  let out = "";
  if (ply % 2 === 0) out += `${Math.floor(ply / 2) + 1}. `;
  else if (startOfLine) out += `${Math.floor(ply / 2) + 1}... `;
  out += main.san;
  if (main.comment)
    out += ` {${main.comment.replace(/[{}]/g, "")}}`;
  out += " ";
  for (let i = 1; i < nodes.length; i++) {
    out += "(" + writeSeq([nodes[i]], ply, true).trim() + ") ";
  }
  out += writeSeq(main.children, ply + 1, nodes.length > 1);
  return out;
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
