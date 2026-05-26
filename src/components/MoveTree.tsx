import type { PgnNode } from "../pgnTree";

interface Props {
  children: PgnNode[];
  current: PgnNode | null;
  onSelect: (path: PgnNode[]) => void;
}

// Renders the PGN as clickable notation: mainline inline, variations in
// parentheses, the current move highlighted.
export function MoveTree({ children, current, onSelect }: Props) {
  let key = 0;
  const nextKey = () => key++;

  function label(node: PgnNode, ply: number, force: boolean): string {
    const no = Math.ceil(ply / 2);
    if (node.color === "w") return `${no}. ${node.san}`;
    return force ? `${no}… ${node.san}` : node.san;
  }

  function render(
    nodes: PgnNode[],
    path: PgnNode[],
    startOfLine: boolean,
  ): JSX.Element[] {
    if (nodes.length === 0) return [];
    const out: JSX.Element[] = [];
    const main = nodes[0];
    const mainPath = [...path, main];

    out.push(
      <button
        key={nextKey()}
        className={`move ${main === current ? "current" : ""}`}
        onClick={() => onSelect(mainPath)}
      >
        {label(main, mainPath.length, startOfLine)}
      </button>,
    );

    // Alternatives to the mainline move, shown as parenthesised variations.
    for (let i = 1; i < nodes.length; i++) {
      out.push(
        <span key={nextKey()} className="var">
          ({render([nodes[i]], path, true)})
        </span>,
      );
    }

    out.push(...render(main.children, mainPath, false));
    return out;
  }

  if (children.length === 0) {
    return <p className="muted small">No moves in this chapter.</p>;
  }

  return <div className="movetree">{render(children, [], true)}</div>;
}
