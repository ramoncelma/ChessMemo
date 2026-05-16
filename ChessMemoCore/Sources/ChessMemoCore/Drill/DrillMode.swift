import Foundation

/// Which top-level menu the user is drilling from. The mode affects whose
/// moves the user is responsible for at each ply.
public enum DrillMode: String, Codable, Sendable, CaseIterable {
    /// User picks a side (`userColor`). App auto-plays the opponent.
    case repertoire
    /// User drills every move regardless of color.
    case fullGame
    /// User plays only the side to move at the starting FEN.
    case tactics
}

/// Behaviour when the user plays a wrong move.
public enum OnFailureBehaviour: String, Codable, Sendable, CaseIterable {
    case showMove
    case showMoveAndComment
    case autoLecture
}

public struct DrillSettings: Codable, Sendable, Equatable {
    public var onFailure: OnFailureBehaviour
    public var allowRetry: Bool
    public var maxRetries: Int

    public init(
        onFailure: OnFailureBehaviour = .showMoveAndComment,
        allowRetry: Bool = true,
        maxRetries: Int = 1
    ) {
        self.onFailure = onFailure
        self.allowRetry = allowRetry
        self.maxRetries = maxRetries
    }

    public static let `default` = DrillSettings()
}
