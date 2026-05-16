import SwiftUI
import ChessMemoCore

/// A tap-to-move SwiftUI chess board.
///
/// Two-tap interaction: tap a piece, then tap a destination. The view does
/// not validate legality; it just emits `onMove(from:to:)`. The drill engine
/// (or a future ChessKit integration) is responsible for accepting or
/// rejecting the move.
struct BoardView: View {
    let board: Board
    let orientation: PieceColor
    let highlightedSquares: Set<Square>
    let onMove: (Square, Square) -> Void

    @State private var selected: Square?

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let cell = side / 8
            ZStack {
                squaresLayer(cell: cell)
                piecesLayer(cell: cell)
            }
            .frame(width: side, height: side)
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func squaresLayer(cell: CGFloat) -> some View {
        ZStack {
            ForEach(0..<64, id: \.self) { i in
                let sq = Square(i)!
                let displayFile = orientation == .white ? sq.file : 7 - sq.file
                let displayRank = orientation == .white ? 7 - sq.rank : sq.rank
                let isLight = (sq.file + sq.rank) % 2 == 1
                let isSelected = selected == sq
                let isHighlight = highlightedSquares.contains(sq)
                Rectangle()
                    .fill(squareColor(light: isLight, selected: isSelected, highlight: isHighlight))
                    .frame(width: cell, height: cell)
                    .position(x: CGFloat(displayFile) * cell + cell / 2,
                              y: CGFloat(displayRank) * cell + cell / 2)
                    .onTapGesture { tap(sq) }
            }
        }
    }

    private func piecesLayer(cell: CGFloat) -> some View {
        ZStack {
            ForEach(0..<64, id: \.self) { i in
                if let piece = board[Square(i)!] {
                    let sq = Square(i)!
                    let displayFile = orientation == .white ? sq.file : 7 - sq.file
                    let displayRank = orientation == .white ? 7 - sq.rank : sq.rank
                    Text(glyph(for: piece))
                        .font(.system(size: cell * 0.72))
                        .frame(width: cell, height: cell)
                        .position(x: CGFloat(displayFile) * cell + cell / 2,
                                  y: CGFloat(displayRank) * cell + cell / 2)
                        .allowsHitTesting(false)
                }
            }
        }
    }

    private func squareColor(light: Bool, selected: Bool, highlight: Bool) -> Color {
        if selected  { return .yellow.opacity(0.7) }
        if highlight { return .green.opacity(0.45) }
        return light ? Color(white: 0.92) : Color(red: 0.45, green: 0.58, blue: 0.34)
    }

    private func tap(_ sq: Square) {
        if let from = selected {
            if from == sq { selected = nil; return }
            onMove(from, sq)
            selected = nil
        } else if board[sq] != nil {
            selected = sq
        }
    }

    /// Unicode chess glyphs — good enough for a prototype; replace with SVG
    /// piece assets when polishing.
    private func glyph(for piece: Piece) -> String {
        switch (piece.color, piece.kind) {
        case (.white, .king):   return "\u{2654}"
        case (.white, .queen):  return "\u{2655}"
        case (.white, .rook):   return "\u{2656}"
        case (.white, .bishop): return "\u{2657}"
        case (.white, .knight): return "\u{2658}"
        case (.white, .pawn):   return "\u{2659}"
        case (.black, .king):   return "\u{265A}"
        case (.black, .queen):  return "\u{265B}"
        case (.black, .rook):   return "\u{265C}"
        case (.black, .bishop): return "\u{265D}"
        case (.black, .knight): return "\u{265E}"
        case (.black, .pawn):   return "\u{265F}"
        }
    }
}
