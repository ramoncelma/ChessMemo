import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Orientation } from "../types";

interface Props {
  fen: string;
  orientation: Orientation;
  draggable: boolean;
  onDrop: (from: string, to: string) => boolean;
}

export function Board({ fen, orientation, draggable, onDrop }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.min(el.clientWidth, 480));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="board-wrap">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        boardWidth={width}
        arePiecesDraggable={draggable}
        onPieceDrop={(from, to) => onDrop(from, to)}
        customBoardStyle={{ borderRadius: "8px" }}
        customDarkSquareStyle={{ backgroundColor: "#6b8299" }}
        customLightSquareStyle={{ backgroundColor: "#dfe6ee" }}
      />
    </div>
  );
}
