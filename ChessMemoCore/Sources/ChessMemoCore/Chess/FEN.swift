import Foundation

public extension Board {
    /// Encode the current position as Forsyth–Edwards Notation.
    /// Used as the stable key identifying an SRS card's position.
    var fen: String {
        var rows: [String] = []
        for rank in stride(from: 7, through: 0, by: -1) {
            var row = ""
            var empty = 0
            for file in 0..<8 {
                if let p = pieces[Square(file: file, rank: rank)!.index] {
                    if empty > 0 { row += "\(empty)"; empty = 0 }
                    row += fenLetter(for: p)
                } else {
                    empty += 1
                }
            }
            if empty > 0 { row += "\(empty)" }
            rows.append(row)
        }
        let placement = rows.joined(separator: "/")
        let side = sideToMove == .white ? "w" : "b"
        var castle = ""
        if castling.contains(.whiteKingside)  { castle += "K" }
        if castling.contains(.whiteQueenside) { castle += "Q" }
        if castling.contains(.blackKingside)  { castle += "k" }
        if castling.contains(.blackQueenside) { castle += "q" }
        if castle.isEmpty { castle = "-" }
        let ep = enPassant.map { "\($0)" } ?? "-"
        return "\(placement) \(side) \(castle) \(ep) \(halfmoveClock) \(fullmoveNumber)"
    }

    private func fenLetter(for piece: Piece) -> String {
        let base: String
        switch piece.kind {
        case .pawn:   base = "p"
        case .knight: base = "n"
        case .bishop: base = "b"
        case .rook:   base = "r"
        case .queen:  base = "q"
        case .king:   base = "k"
        }
        return piece.color == .white ? base.uppercased() : base
    }
}
