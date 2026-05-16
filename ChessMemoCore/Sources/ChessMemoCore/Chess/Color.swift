import Foundation

public enum PieceColor: String, Codable, Sendable, CaseIterable {
    case white, black

    public var opposite: PieceColor { self == .white ? .black : .white }
}
