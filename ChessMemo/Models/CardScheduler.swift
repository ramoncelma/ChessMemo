import Foundation
import SwiftData
import ChessMemoCore

/// Bridges DrillSession + FSRS + SwiftData CardRecord persistence.
@MainActor
struct CardScheduler {
    let context: ModelContext
    let fsrs = FSRS()

    /// Fetch or create the SRS card for a `(owner, fen, expectedSAN)` triple.
    func findOrCreate(ownerId: UUID, fen: String, expectedSAN: String) throws -> CardRecord {
        let predicate = #Predicate<CardRecord> { c in
            c.ownerId == ownerId && c.fen == fen && c.expectedSAN == expectedSAN
        }
        let descriptor = FetchDescriptor<CardRecord>(predicate: predicate)
        if let existing = try context.fetch(descriptor).first {
            return existing
        }
        let card = CardRecord(ownerId: ownerId, fen: fen, expectedSAN: expectedSAN)
        context.insert(card)
        return card
    }

    /// Apply a rating to a card, persisting both the new state and a ReviewLog.
    func record(_ card: CardRecord, rating: Rating, now: Date = .now) throws {
        card.state = fsrs.schedule(card.state, rating: rating, now: now)
        context.insert(ReviewLog(cardId: card.id, rating: rating, reviewedAt: now))
        try context.save()
    }

    /// Fetch all cards due (or new) for the given owner.
    func dueCards(ownerId: UUID, now: Date = .now) throws -> [CardRecord] {
        let predicate = #Predicate<CardRecord> { c in c.ownerId == ownerId }
        let all = try context.fetch(FetchDescriptor<CardRecord>(predicate: predicate))
        return all.filter { card in
            guard let due = card.due else { return true } // new
            return due <= now
        }
    }
}
