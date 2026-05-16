import Foundation

/// Minimal chess board: tracks piece placement and applies SAN moves.
///
/// Scope:
/// - Pseudo-legal move generation for SAN disambiguation.
/// - Castling, en passant, promotion.
///
/// Out of scope (TODO via ChessKit):
/// - Pin detection / legal-move filtering (we trust PGN to contain legal moves).
/// - Check / mate / stalemate detection beyond what SAN already encodes.
public struct Board: Sendable {
    public private(set) var pieces: [Piece?]
    public private(set) var sideToMove: PieceColor
    public private(set) var castling: CastlingRights
    public private(set) var enPassant: Square?
    public private(set) var halfmoveClock: Int
    public private(set) var fullmoveNumber: Int

    public init() {
        self.pieces = Self.startingPieces
        self.sideToMove = .white
        self.castling = .all
        self.enPassant = nil
        self.halfmoveClock = 0
        self.fullmoveNumber = 1
    }

    public subscript(square: Square) -> Piece? {
        get { pieces[square.index] }
    }

    /// Apply a SAN move and return the resolved `Move`. Throws if the SAN
    /// cannot be matched to a pseudo-legal move from the current position.
    @discardableResult
    public mutating func applySAN(_ san: String) throws -> Move {
        let move = try resolveSAN(san)
        applyResolved(move)
        return move
    }

    /// Apply a coordinate move. Used when the user makes a move on the board.
    /// Returns the SAN representation so it can be compared with the expected move.
    @discardableResult
    public mutating func applyMove(from: Square, to: Square, promotion: PieceKind? = nil) throws -> String {
        guard let piece = pieces[from.index], piece.color == sideToMove else {
            throw ChessError.illegalMove("no piece of side-to-move at \(from)")
        }
        let san = encodeSAN(piece: piece, from: from, to: to, promotion: promotion)
        let move = Move(from: from, to: to, promotion: promotion, san: san)
        applyResolved(move)
        return san
    }

    // MARK: - Resolution

    private mutating func resolveSAN(_ rawSAN: String) throws -> Move {
        let san = rawSAN.trimmingCharacters(in: CharacterSet(charactersIn: "+#?!"))

        // Castling
        if san == "O-O" || san == "0-0" {
            let rank = sideToMove == .white ? 0 : 7
            let from = Square(file: 4, rank: rank)!
            let to = Square(file: 6, rank: rank)!
            return Move(from: from, to: to, san: rawSAN)
        }
        if san == "O-O-O" || san == "0-0-0" {
            let rank = sideToMove == .white ? 0 : 7
            let from = Square(file: 4, rank: rank)!
            let to = Square(file: 2, rank: rank)!
            return Move(from: from, to: to, san: rawSAN)
        }

        // Pawn promotion suffix (e.g. "e8=Q")
        var body = san
        var promotion: PieceKind?
        if let eq = body.firstIndex(of: "=") {
            let promoStr = String(body[body.index(after: eq)...])
            promotion = pieceKind(for: promoStr.first ?? "?")
            body = String(body[..<eq])
        }

        let chars = Array(body)
        guard !chars.isEmpty else { throw ChessError.illegalMove("empty SAN") }

        // Determine piece type. Uppercase = piece move; otherwise pawn.
        let pieceKind: PieceKind
        var idx = 0
        if let firstCh = chars.first, firstCh.isUppercase, let pk = self.pieceKind(for: firstCh) {
            pieceKind = pk
            idx = 1
        } else {
            pieceKind = .pawn
        }

        // Capture marker
        let captureIdx = chars.firstIndex(of: "x")
        let hasCapture = captureIdx != nil

        // Last two chars are the destination square.
        guard chars.count >= idx + 2 else { throw ChessError.illegalMove("SAN too short: \(san)") }
        let destStr = String(chars[chars.count - 2 ..< chars.count])
        guard let dest = Square(destStr) else { throw ChessError.illegalMove("bad dest \(destStr)") }

        // Anything between piece letter and dest is disambiguation (file/rank/capture x).
        let disambigChars = chars[idx ..< chars.count - 2].filter { $0 != "x" }
        var disambigFile: Int?
        var disambigRank: Int?
        for c in disambigChars {
            if let a = c.asciiValue, a >= Character("a").asciiValue!, a <= Character("h").asciiValue! {
                disambigFile = Int(a) - Int(Character("a").asciiValue!)
            } else if let a = c.asciiValue, a >= Character("1").asciiValue!, a <= Character("8").asciiValue! {
                disambigRank = Int(a) - Int(Character("1").asciiValue!)
            }
        }

        // Find candidate source squares.
        let candidates = findOrigins(pieceKind: pieceKind, target: dest, capture: hasCapture, color: sideToMove)
            .filter { sq in
                if let f = disambigFile, sq.file != f { return false }
                if let r = disambigRank, sq.rank != r { return false }
                return true
            }

        guard let from = candidates.first, candidates.count == 1 else {
            throw ChessError.illegalMove("could not uniquely resolve SAN \(san): \(candidates.count) candidates")
        }
        return Move(from: from, to: dest, promotion: promotion, san: rawSAN)
    }

    private func findOrigins(pieceKind: PieceKind, target: Square, capture: Bool, color: PieceColor) -> [Square] {
        var result: [Square] = []
        for i in 0..<64 {
            guard let p = pieces[i], p.color == color, p.kind == pieceKind else { continue }
            let from = Square(i)!
            if canMove(piece: p, from: from, to: target, capture: capture) {
                result.append(from)
            }
        }
        return result
    }

    private func canMove(piece: Piece, from: Square, to: Square, capture: Bool) -> Bool {
        let df = to.file - from.file
        let dr = to.rank - from.rank

        switch piece.kind {
        case .pawn:
            let dir = piece.color == .white ? 1 : -1
            let startRank = piece.color == .white ? 1 : 6
            if df == 0, dr == dir, pieces[to.index] == nil { return true }
            if df == 0, dr == 2 * dir, from.rank == startRank,
               pieces[to.index] == nil,
               pieces[Square(file: from.file, rank: from.rank + dir)!.index] == nil { return true }
            if abs(df) == 1, dr == dir {
                if let target = pieces[to.index], target.color != piece.color { return true }
                if to == enPassant { return true }
            }
            return false

        case .knight:
            let ad = (abs(df), abs(dr))
            guard ad == (1, 2) || ad == (2, 1) else { return false }
            return pieces[to.index]?.color != piece.color

        case .bishop:
            guard abs(df) == abs(dr), df != 0 else { return false }
            return isPathClear(from: from, to: to) && pieces[to.index]?.color != piece.color

        case .rook:
            guard df == 0 || dr == 0, !(df == 0 && dr == 0) else { return false }
            return isPathClear(from: from, to: to) && pieces[to.index]?.color != piece.color

        case .queen:
            let straight = (df == 0 || dr == 0) && !(df == 0 && dr == 0)
            let diag = abs(df) == abs(dr) && df != 0
            guard straight || diag else { return false }
            return isPathClear(from: from, to: to) && pieces[to.index]?.color != piece.color

        case .king:
            guard abs(df) <= 1, abs(dr) <= 1, !(df == 0 && dr == 0) else { return false }
            return pieces[to.index]?.color != piece.color
        }
    }

    private func isPathClear(from: Square, to: Square) -> Bool {
        let df = (to.file - from.file).signum()
        let dr = (to.rank - from.rank).signum()
        var f = from.file + df
        var r = from.rank + dr
        while f != to.file || r != to.rank {
            if pieces[Square(file: f, rank: r)!.index] != nil { return false }
            f += df; r += dr
        }
        return true
    }

    // MARK: - Apply

    private mutating func applyResolved(_ move: Move) {
        guard let piece = pieces[move.from.index] else { return }
        var captured = pieces[move.to.index]

        // En passant capture
        if piece.kind == .pawn, move.to == enPassant, captured == nil {
            let capturedRank = piece.color == .white ? move.to.rank - 1 : move.to.rank + 1
            if let cap = Square(file: move.to.file, rank: capturedRank) {
                captured = pieces[cap.index]
                pieces[cap.index] = nil
            }
        }

        // Castling: move the rook too
        if piece.kind == .king, abs(move.to.file - move.from.file) == 2 {
            let rank = move.from.rank
            let (rookFromFile, rookToFile) = move.to.file == 6 ? (7, 5) : (0, 3)
            let rookFrom = Square(file: rookFromFile, rank: rank)!
            let rookTo = Square(file: rookToFile, rank: rank)!
            pieces[rookTo.index] = pieces[rookFrom.index]
            pieces[rookFrom.index] = nil
        }

        // Move the piece
        pieces[move.to.index] = move.promotion.map { Piece($0, piece.color) } ?? piece
        pieces[move.from.index] = nil

        // Update en passant target
        if piece.kind == .pawn, abs(move.to.rank - move.from.rank) == 2 {
            let mid = (move.to.rank + move.from.rank) / 2
            enPassant = Square(file: move.from.file, rank: mid)
        } else {
            enPassant = nil
        }

        // Update castling rights (simplified)
        if piece.kind == .king {
            if piece.color == .white { castling.remove([.whiteKingside, .whiteQueenside]) }
            else { castling.remove([.blackKingside, .blackQueenside]) }
        }
        if piece.kind == .rook {
            switch (piece.color, move.from.file, move.from.rank) {
            case (.white, 0, 0): castling.remove(.whiteQueenside)
            case (.white, 7, 0): castling.remove(.whiteKingside)
            case (.black, 0, 7): castling.remove(.blackQueenside)
            case (.black, 7, 7): castling.remove(.blackKingside)
            default: break
            }
        }

        // Update clocks
        if piece.kind == .pawn || captured != nil { halfmoveClock = 0 } else { halfmoveClock += 1 }
        if sideToMove == .black { fullmoveNumber += 1 }
        sideToMove = sideToMove.opposite
    }

    // MARK: - SAN encoding

    private func encodeSAN(piece: Piece, from: Square, to: Square, promotion: PieceKind?) -> String {
        // Castling
        if piece.kind == .king, abs(to.file - from.file) == 2 {
            return to.file == 6 ? "O-O" : "O-O-O"
        }

        let capture = pieces[to.index] != nil || (piece.kind == .pawn && to == enPassant)

        if piece.kind == .pawn {
            var s = ""
            if capture {
                let fileChar = Character(UnicodeScalar(UInt8(from.file) + Character("a").asciiValue!))
                s += "\(fileChar)x"
            }
            s += "\(to)"
            if let promo = promotion { s += "=\(promo.sanLetter)" }
            return s
        }

        // Piece move with possible disambiguation.
        let others = findOrigins(pieceKind: piece.kind, target: to, capture: capture, color: piece.color)
            .filter { $0 != from }
        var disambig = ""
        if !others.isEmpty {
            if !others.contains(where: { $0.file == from.file }) {
                let fileChar = Character(UnicodeScalar(UInt8(from.file) + Character("a").asciiValue!))
                disambig = String(fileChar)
            } else if !others.contains(where: { $0.rank == from.rank }) {
                let rankChar = Character(UnicodeScalar(UInt8(from.rank) + Character("1").asciiValue!))
                disambig = String(rankChar)
            } else {
                disambig = "\(from)"
            }
        }
        return "\(piece.kind.sanLetter)\(disambig)\(capture ? "x" : "")\(to)"
    }

    private func pieceKind(for ch: Character) -> PieceKind? {
        switch ch {
        case "N": return .knight
        case "B": return .bishop
        case "R": return .rook
        case "Q": return .queen
        case "K": return .king
        case "P": return .pawn
        default: return nil
        }
    }

    // MARK: - Starting position

    private static let startingPieces: [Piece?] = {
        var p: [Piece?] = Array(repeating: nil, count: 64)
        let back: [PieceKind] = [.rook, .knight, .bishop, .queen, .king, .bishop, .knight, .rook]
        for f in 0..<8 {
            p[Square(file: f, rank: 0)!.index] = Piece(back[f], .white)
            p[Square(file: f, rank: 1)!.index] = Piece(.pawn, .white)
            p[Square(file: f, rank: 6)!.index] = Piece(.pawn, .black)
            p[Square(file: f, rank: 7)!.index] = Piece(back[f], .black)
        }
        return p
    }()
}

public struct CastlingRights: OptionSet, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }

    public static let whiteKingside  = CastlingRights(rawValue: 1 << 0)
    public static let whiteQueenside = CastlingRights(rawValue: 1 << 1)
    public static let blackKingside  = CastlingRights(rawValue: 1 << 2)
    public static let blackQueenside = CastlingRights(rawValue: 1 << 3)
    public static let all: CastlingRights = [.whiteKingside, .whiteQueenside, .blackKingside, .blackQueenside]
}

public enum ChessError: Error, CustomStringConvertible {
    case illegalMove(String)

    public var description: String {
        switch self {
        case .illegalMove(let s): return "Illegal move: \(s)"
        }
    }
}
