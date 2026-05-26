import type { PgnNode } from "../pgnTree";

interface Props {
  children: PgnNode[];
  current: PgnNode | null;
  onSelect: (path: PgnNode[]) => void;
}

// Renders the PGN as clickable notation. The mainline flows inline; each
// variation breaks onto its own indented sub-line so sublines are clear.
export function MoveTree({ children, current, onSelect }: Props) {
  let key = 0;
  const k = () => key++;

  function label(node: PgnNode, ply: number, force: boolean): string {
    const no = Math.ceil(ply / 2);
    if (node.color === "w") return `${no}. ${node.san}`;
    return force ? `${no}… ${node.san}` : node.san;
  }

  function move(node: PgnNode, path: PgnNode[], force: boolean): JSX.Element {
    return (
      <button
        key={k()}
        className={`move ${node === current ? "current" : ""}`}
        onClick={() => onSelect(path)}
      >
        {label(node, path.length, force)}
        {node.comment && (
          <span className="cmt" title={node.comment}>
            *
          </span>
        )}
      </button>
    );
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
        {move(main, mainPath, startOfLine)}
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
    return <p className="muted small">No moves in this chapter.</p>;
  }

  return <div className="movetree">{seq(children, [], true)}</div>;
}
