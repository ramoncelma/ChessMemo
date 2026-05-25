import { useEffect, useMemo, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess, type Square } from "chess.js";
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
  const [selected, setSelected] = useState<Square | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.min(el.clientWidth, 540));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clear any selection when the position changes.
  useEffect(() => setSelected(null), [fen]);

  const theme = themeById(boardThemeId);
  const customPieces = useMemo(() => buildPieces(pieceSet), [pieceSet]);

  // Which squares the selected piece can legally move to (for the dots).
  const legalTargets = useMemo(() => {
    if (!selected) return [] as string[];
    try {
      return new Chess(fen)
        .moves({ square: selected, verbose: true })
        .map((m) => m.to);
    } catch {
      return [] as string[];
    }
  }, [fen, selected]);

  function hasOwnPieceToMove(square: Square): boolean {
    try {
      const game = new Chess(fen);
      const piece = game.get(square);
      return !!piece && piece.color === game.turn();
    } catch {
      return false;
    }
  }

  function handleSquareClick(square: Square) {
    if (!draggable) return;

    if (selected === null) {
      if (hasOwnPieceToMove(square)) setSelected(square);
      return;
    }

    if (square === selected) {
      setSelected(null);
      return;
    }

    // Try the move; if accepted the position changes and selection resets.
    const accepted = onDrop(selected, square);
    if (accepted) {
      setSelected(null);
    } else if (hasOwnPieceToMove(square)) {
      // Clicked a different own piece — switch selection.
      setSelected(square);
    } else {
      setSelected(null);
    }
  }

  function handleDrop(from: string, to: string): boolean {
    setSelected(null);
    return onDrop(from, to);
  }

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (selected) {
    squareStyles[selected] = { background: "rgba(91,157,255,0.45)" };
    for (const t of legalTargets) {
      squareStyles[t] = {
        background:
          "radial-gradient(circle, rgba(91,157,255,0.7) 22%, transparent 24%)",
      };
    }
  }

  return (
    <div ref={wrapRef} className="board-wrap">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        boardWidth={width}
        arePiecesDraggable={draggable}
        onPieceDrop={handleDrop}
        onSquareClick={handleSquareClick}
        customPieces={customPieces}
        customSquareStyles={squareStyles}
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
