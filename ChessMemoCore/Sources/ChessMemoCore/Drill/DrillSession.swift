import Foundation

/// In-memory session state for a single drill run through a PGN line.
///
/// The owning app should construct one of these per drill, drive it via
/// `submit(san:)`, and observe `state` to update the UI.
public final class DrillSession {
    public struct StepOutcome {
        public enum Kind {
            /// User's move matched the expected continuation.
            case correct
            /// User's move was wrong, but they still have retries left.
            case incorrectRetry(retriesLeft: Int)
            /// User's move was wrong and they're out of retries.
            /// `correctSAN` is the expected move; `comment` is the PGN annotation
            /// attached to the expected move's node, if any.
            case incorrectFinal(correctSAN: String, comment: String?)
            /// The line is finished.
            case done
        }
        public let kind: Kind
        /// The node the session is now positioned at (after applying the move,
        /// or unchanged on retry).
        public let node: PGNNode
    }

    public let mode: DrillMode
    public let userColor: PieceColor?
    public let settings: DrillSettings
    public private(set) var board: Board
    public private(set) var current: PGNNode
    public private(set) var retriesUsed: Int = 0
    public private(set) var failed: Bool = false

    public init(
        rootNode: PGNNode,
        mode: DrillMode,
        userColor: PieceColor? = nil,
        settings: DrillSettings = .default,
        initialBoard: Board = Board()
    ) {
        self.current = rootNode
        self.mode = mode
        self.userColor = userColor
        self.settings = settings
        self.board = initialBoard
    }

    /// The next expected mainline move, or nil if the line is over.
    public var expectedNextSAN: String? { current.mainline?.move }

    /// True if the user is responsible for the next move under this mode.
    public var isUserTurn: Bool {
        switch mode {
        case .fullGame:
            return true
        case .repertoire, .tactics:
            return board.sideToMove == (userColor ?? board.sideToMove)
        }
    }

    /// Auto-play the opponent's move on the mainline if it isn't the user's turn.
    /// Returns the node advanced to, or nil if there's nothing to play.
    @discardableResult
    public func autoPlayOpponentIfNeeded() throws -> PGNNode? {
        guard !isUserTurn, let next = current.mainline, let san = next.move else { return nil }
        try board.applySAN(san)
        current = next
        return next
    }

    /// Submit the user's attempt at the next move (as SAN).
    public func submit(san userSAN: String) throws -> StepOutcome {
        guard let next = current.mainline, let expected = next.move else {
            return StepOutcome(kind: .done, node: current)
        }

        if sanMatches(userSAN, expected: expected) {
            try board.applySAN(expected)
            current = next
            retriesUsed = 0
            if current.mainline == nil {
                return StepOutcome(kind: .done, node: current)
            }
            return StepOutcome(kind: .correct, node: current)
        }

        // Wrong move.
        if settings.allowRetry, retriesUsed < settings.maxRetries {
            retriesUsed += 1
            return StepOutcome(
                kind: .incorrectRetry(retriesLeft: settings.maxRetries - retriesUsed),
                node: current
            )
        }

        failed = true
        return StepOutcome(
            kind: .incorrectFinal(correctSAN: expected, comment: next.comment),
            node: current
        )
    }

    /// Force-advance past a failed step (after showing the correct move).
    public func skipToNext() throws {
        guard let next = current.mainline, let san = next.move else { return }
        try board.applySAN(san)
        current = next
        retriesUsed = 0
        failed = false
    }

    /// Whether the SRS rating for the just-finished line should be Again/Hard/Good.
    /// (Easy is reserved for an explicit tap in the UI, not implemented here.)
    public func suggestedRating() -> Rating {
        if failed { return .again }
        if retriesUsed > 0 { return .hard }
        return .good
    }

    private func sanMatches(_ user: String, expected: String) -> Bool {
        // Normalize: strip check/mate marks and annotation glyphs.
        func norm(_ s: String) -> String {
            var t = s
            while let last = t.last, "+#?!".contains(last) { t.removeLast() }
            return t
        }
        return norm(user) == norm(expected)
    }
}
