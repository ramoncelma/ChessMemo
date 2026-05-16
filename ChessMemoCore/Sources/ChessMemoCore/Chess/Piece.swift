import Foundation

public enum PieceKind: String, Codable, Sendable, CaseIterable {
    case pawn, knight, bishop, rook, queen, king

    public var sanLetter: String {
        switch self {
        case .pawn:   return ""
        case .knight: return "N"
        case .bishop: return "B"
        case .rook:   return "R"
        case .queen:  return "Q"
        case .king:   return "K"
        }
    }
}

public struct Piece: Hashable, Sendable {
    public let kind: PieceKind
    public let color: PieceColor

    public init(_ kind: PieceKind, _ color: PieceColor) {
        self.kind = kind
        self.color = color
    }
}
