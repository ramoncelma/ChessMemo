import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Orientation } from "../types";
import { themeById, type PieceSet } from "../settings";

interface Props {
  fen: string;
  orientation: Orientation;
  draggable: boolean;
  onDrop: (from: string, to: string) => boolean;
  boardThemeId: string;
  pieceSet: PieceSet;
}

const PIECE_CODES = [
  "wP", "wN", "wB", "wR", "wQ", "wK",
  "bP", "bN", "bB", "bR", "bQ", "bK",
] as const;

function pieceUrl(set: PieceSet, code: string): string {
  return `https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/${set}/${code}.svg`;
}

function buildPieces(set: PieceSet) {
  const map: Record<string, (p: { squareWidth: number }) => JSX.Element> = {};
  for (const code of PIECE_CODES) {
    const url = pieceUrl(set, code);
    map[code] = ({ squareWidth }) => (
      <img
        src={url}
        alt={code}
        draggable={false}
        style={{ width: squareWidth, height: squareWidth }}
      />
    );
  }
  return map;
}

export function Board({
  fen,
  orientation,
  draggable,
  onDrop,
  boardThemeId,
  pieceSet,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.min(el.clientWidth, 460));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const theme = themeById(boardThemeId);
  const customPieces = useMemo(() => buildPieces(pieceSet), [pieceSet]);

  return (
    <div ref={wrapRef} className="board-wrap">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        boardWidth={width}
        arePiecesDraggable={draggable}
        onPieceDrop={(from, to) => onDrop(from, to)}
        customPieces={customPieces}
        customBoardStyle={{
          borderRadius: "14px",
          boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
        }}
        customDarkSquareStyle={{ backgroundColor: theme.dark }}
        customLightSquareStyle={{ backgroundColor: theme.light }}
      />
    </div>
  );
}
