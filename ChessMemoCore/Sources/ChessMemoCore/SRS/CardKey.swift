import Foundation

/// Stable identifier for an SRS card.
///
/// A card is "play move M from FEN F in repertoire R". Using FEN — not the
/// PGN node id — lets the same position drilled from different transpositions
/// share progress. The drill engine uses this key as the SwiftData lookup.
public struct CardKey: Hashable, Codable, Sendable {
    public let repertoireId: UUID
    public let fen: String
    public let expectedSAN: String

    public init(repertoireId: UUID, fen: String, expectedSAN: String) {
        self.repertoireId = repertoireId
        self.fen = fen
        self.expectedSAN = expectedSAN
    }
}
