import Foundation

/// A node in a PGN variation tree.
///
/// Each node represents a position reached by playing `move` from its parent.
/// The root node has `move == nil` and represents the starting position.
public final class PGNNode: @unchecked Sendable {
    public let id: UUID
    public weak var parent: PGNNode?
    public let move: String?         // SAN; nil for root
    public let ply: Int              // half-move count from root
    public var children: [PGNNode]   // children[0] is the mainline continuation
    public var comment: String?      // {…} after the move
    public var nags: [Int]           // $1, $2, …

    public init(move: String?, ply: Int, parent: PGNNode? = nil) {
        self.id = UUID()
        self.move = move
        self.ply = ply
        self.parent = parent
        self.children = []
        self.comment = nil
        self.nags = []
    }

    /// The mainline child, if any.
    public var mainline: PGNNode? { children.first }

    /// Walks down the mainline collecting every node (including this one).
    public func mainlineNodes() -> [PGNNode] {
        var out: [PGNNode] = []
        var cur: PGNNode? = self
        while let n = cur {
            out.append(n)
            cur = n.mainline
        }
        return out
    }

    /// Depth-first traversal of every node in the tree.
    public func allNodes() -> [PGNNode] {
        var out: [PGNNode] = [self]
        for c in children { out.append(contentsOf: c.allNodes()) }
        return out
    }
}

/// A complete parsed PGN game: tag-pair headers + the move tree.
public struct PGNGame: Sendable {
    public var tags: [String: String]
    public var root: PGNNode

    public init(tags: [String: String], root: PGNNode) {
        self.tags = tags
        self.root = root
    }

    /// Best-effort title from `White vs Black, Event`.
    public var displayTitle: String {
        let white = tags["White"] ?? "?"
        let black = tags["Black"] ?? "?"
        let event = tags["Event"]
        let base = "\(white) – \(black)"
        return event.map { "\(base) (\($0))" } ?? base
    }
}
