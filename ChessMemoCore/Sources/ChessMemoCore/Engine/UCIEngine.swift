import Foundation

public struct EngineEvaluation: Sendable, Equatable {
    /// Centipawn evaluation from White's perspective. Nil if mate-in-N.
    public let centipawns: Int?
    /// Positive = side-to-move mates in N. Negative = side-to-move is mated.
    public let mateIn: Int?
    /// Best move in UCI (long algebraic) form, e.g. "e2e4", "e7e8q".
    public let bestMove: String?
    /// Principal variation in UCI tokens.
    public let pv: [String]
    /// Search depth reached.
    public let depth: Int

    public init(centipawns: Int?, mateIn: Int?, bestMove: String?, pv: [String], depth: Int) {
        self.centipawns = centipawns
        self.mateIn = mateIn
        self.bestMove = bestMove
        self.pv = pv
        self.depth = depth
    }
}

public protocol UCIEngine: AnyObject, Sendable {
    func start() async throws
    func stop() async
    func evaluate(fen: String, depth: Int) async throws -> EngineEvaluation
}

/// Stand-in engine that returns a fixed evaluation. Lets the UI compile and
/// be exercised without a real Stockfish binary present.
///
/// TODO(stockfish): replace with `StockfishProcess` that spawns the bundled
/// binary, pipes UCI commands over stdio, and parses `info depth … score …`
/// / `bestmove` lines.
public final class StubEngine: UCIEngine, @unchecked Sendable {
    public init() {}
    public func start() async throws {}
    public func stop() async {}
    public func evaluate(fen: String, depth: Int) async throws -> EngineEvaluation {
        return EngineEvaluation(centipawns: 24, mateIn: nil, bestMove: "e2e4", pv: ["e2e4", "e7e5"], depth: depth)
    }
}
