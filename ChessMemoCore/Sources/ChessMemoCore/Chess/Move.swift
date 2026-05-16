import Foundation

/// A chess move described in coordinate form, plus its SAN representation if known.
public struct Move: Hashable, Sendable {
    public let from: Square
    public let to: Square
    public let promotion: PieceKind?
    /// Standard algebraic notation, as parsed from PGN. Used as the canonical
    /// drill comparison key. Nil if the move was constructed from coordinates only.
    public let san: String?

    public init(from: Square, to: Square, promotion: PieceKind? = nil, san: String? = nil) {
        self.from = from
        self.to = to
        self.promotion = promotion
        self.san = san
    }
}
