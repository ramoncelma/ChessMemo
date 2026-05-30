import type { PgnNode } from "../pgnTree";

interface Props {
  children: PgnNode[];
  current: PgnNode | null;
  onSelect: (path: PgnNode[]) => void;
}

// Hierarchical PGN notation: mainline flows inline, each variation breaks
// onto its own indented subline. Clicking any move jumps the board there.
export function MoveTree({ children, current, onSelect }: Props) {
  let key = 0;
  const k = () => key++;

  function label(node: PgnNode, ply: number, force: boolean): string {
    const no = Math.ceil(ply / 2);
    if (node.color === "w") return `${no}. ${node.san}`;
    return force ? `${no}… ${node.san}` : node.san;
  }

  function seq(
    nodes: PgnNode[],
    path: PgnNode[],
    startOfLine: boolean,
  ): JSX.Element | null {
    if (nodes.length === 0) return null;
    const main = nodes[0];
    const mainPath = [...path, main];
    const hasVars = nodes.length > 1;
    return (
      <>
        <button
          key={k()}
          className={`move ${main === current ? "current" : ""}`}
          onClick={() => onSelect(mainPath)}
        >
          {label(main, mainPath.length, startOfLine)}
        </button>
        {nodes.slice(1).map((alt) => (
          <div key={k()} className="subline">
            {seq([alt], path, true)}
          </div>
        ))}
        {seq(main.children, mainPath, hasVars)}
      </>
    );
  }

  if (children.length === 0) {
    return <p className="muted small">—</p>;
  }
  return <div className="movetree">{seq(children, [], true)}</div>;
}
