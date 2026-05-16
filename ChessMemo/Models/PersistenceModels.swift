import Foundation
import SwiftData
import ChessMemoCore

// MARK: - Content kinds

/// User-facing repertoire (the "Repertoires" menu).
@Model
final class Repertoire {
    @Attribute(.unique) var id: UUID
    var name: String
    var userColorRaw: String   // "white" | "black"
    var pgnSource: String      // raw PGN text
    var createdAt: Date

    init(id: UUID = UUID(), name: String, userColor: PieceColor, pgnSource: String, createdAt: Date = .now) {
        self.id = id
        self.name = name
        self.userColorRaw = userColor.rawValue
        self.pgnSource = pgnSource
        self.createdAt = createdAt
    }

    var userColor: PieceColor {
        get { PieceColor(rawValue: userColorRaw) ?? .white }
        set { userColorRaw = newValue.rawValue }
    }
}

/// A full annotated game (the "Games" menu).
@Model
final class GameRecord {
    @Attribute(.unique) var id: UUID
    var displayTitle: String
    var pgnSource: String
    var createdAt: Date

    init(id: UUID = UUID(), displayTitle: String, pgnSource: String, createdAt: Date = .now) {
        self.id = id
        self.displayTitle = displayTitle
        self.pgnSource = pgnSource
        self.createdAt = createdAt
    }
}

/// A tactic / endgame study (the "Tactics" menu).
@Model
final class TacticRecord {
    @Attribute(.unique) var id: UUID
    var name: String
    var pgnSource: String
    var startingFEN: String?
    var createdAt: Date

    init(id: UUID = UUID(), name: String, pgnSource: String, startingFEN: String? = nil, createdAt: Date = .now) {
        self.id = id
        self.name = name
        self.pgnSource = pgnSource
        self.startingFEN = startingFEN
        self.createdAt = createdAt
    }
}

// MARK: - SRS

@Model
final class CardRecord {
    @Attribute(.unique) var id: UUID
    /// Foreign key to a Repertoire/GameRecord/TacticRecord (we don't constrain which).
    var ownerId: UUID
    var fen: String
    var expectedSAN: String

    // CardState mirror — flattened so SwiftData can index `due`.
    var difficulty: Double
    var stability: Double
    var lastInterval: Double
    var reps: Int
    var lapses: Int
    var due: Date?
    var lastReview: Date?

    init(ownerId: UUID, fen: String, expectedSAN: String) {
        self.id = UUID()
        self.ownerId = ownerId
        self.fen = fen
        self.expectedSAN = expectedSAN
        self.difficulty = 5.0
        self.stability = 0.0
        self.lastInterval = 0
        self.reps = 0
        self.lapses = 0
        self.due = nil
        self.lastReview = nil
    }

    var state: CardState {
        get {
            var s = CardState()
            s.difficulty = difficulty
            s.stability = stability
            s.lastInterval = lastInterval
            s.reps = reps
            s.lapses = lapses
            s.due = due
            s.lastReview = lastReview
            return s
        }
        set {
            difficulty = newValue.difficulty
            stability = newValue.stability
            lastInterval = newValue.lastInterval
            reps = newValue.reps
            lapses = newValue.lapses
            due = newValue.due
            lastReview = newValue.lastReview
        }
    }
}

@Model
final class ReviewLog {
    @Attribute(.unique) var id: UUID
    var cardId: UUID
    var rating: Int
    var reviewedAt: Date

    init(cardId: UUID, rating: Rating, reviewedAt: Date = .now) {
        self.id = UUID()
        self.cardId = cardId
        self.rating = rating.rawValue
        self.reviewedAt = reviewedAt
    }
}
