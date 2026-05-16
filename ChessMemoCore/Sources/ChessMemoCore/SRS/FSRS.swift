import Foundation

/// The four-button rating used by FSRS / Anki.
public enum Rating: Int, Codable, Sendable, CaseIterable {
    case again = 1
    case hard  = 2
    case good  = 3
    case easy  = 4
}

/// FSRS card state. `difficulty` and `stability` are the model parameters.
public struct CardState: Codable, Sendable, Equatable {
    /// 1...10 (Anki-style D); higher = harder for this user.
    public var difficulty: Double
    /// Days. Memory stability — interval at which retention = requested target.
    public var stability: Double
    /// Days since the last review (set when scheduling).
    public var lastInterval: Double
    /// Number of reviews so far.
    public var reps: Int
    /// Number of times the user pressed `Again`.
    public var lapses: Int
    /// When this card is next due. Nil = brand new, due now.
    public var due: Date?
    /// Timestamp of the last review.
    public var lastReview: Date?

    public init() {
        self.difficulty = 5.0
        self.stability = 0.0
        self.lastInterval = 0
        self.reps = 0
        self.lapses = 0
        self.due = nil
        self.lastReview = nil
    }

    public var isNew: Bool { reps == 0 }
}

/// FSRS scheduler. The 17 weights below are the v4 published defaults; they
/// can be tuned per-user with offline analysis but are good enough day-one.
///
/// Reference: https://github.com/open-spaced-repetition/fsrs4anki (v4 weights).
public struct FSRS: Sendable {
    public struct Params: Sendable {
        public var w: [Double]
        public var requestRetention: Double
        public var maximumInterval: Double

        public init(w: [Double], requestRetention: Double = 0.9, maximumInterval: Double = 36500) {
            self.w = w
            self.requestRetention = requestRetention
            self.maximumInterval = maximumInterval
        }

        public static let defaultV4 = Params(w: [
            0.4, 0.6, 2.4, 5.8,
            4.93, 0.94, 0.86, 0.01,
            1.49, 0.14, 0.94, 2.18,
            0.05, 0.34, 1.26, 0.29, 2.61
        ])
    }

    public let params: Params

    public init(params: Params = .defaultV4) { self.params = params }

    /// Update a card given a rating, returning the new state with a scheduled `due` date.
    public func schedule(_ card: CardState, rating: Rating, now: Date = Date()) -> CardState {
        var s = card
        let w = params.w

        if s.isNew {
            // Initial difficulty: w[4] - (rating - 3) * w[5]
            s.difficulty = clampDifficulty(w[4] - Double(rating.rawValue - 3) * w[5])
            // Initial stability: w[rating-1]
            s.stability = max(0.1, w[rating.rawValue - 1])
        } else {
            let elapsed = s.lastReview.map { max(0.0, now.timeIntervalSince($0) / 86400.0) } ?? s.lastInterval
            let retrievability = pow(1.0 + elapsed / (9.0 * s.stability), -1.0)

            // Difficulty update
            let nextD = s.difficulty - w[6] * Double(rating.rawValue - 3)
            s.difficulty = clampDifficulty(w[7] * 5.0 + (1 - w[7]) * nextD)

            if rating == .again {
                let lapseStability = w[11]
                    * pow(s.difficulty, -w[12])
                    * (pow(s.stability + 1, w[13]) - 1)
                    * exp((1 - retrievability) * w[14])
                s.stability = max(0.1, lapseStability)
                s.lapses += 1
            } else {
                let hardPenalty = rating == .hard ? w[15] : 1.0
                let easyBonus   = rating == .easy ? w[16] : 1.0
                let factor = exp(w[8])
                    * (11 - s.difficulty)
                    * pow(s.stability, -w[9])
                    * (exp((1 - retrievability) * w[10]) - 1)
                s.stability = s.stability * (1 + factor * hardPenalty * easyBonus)
            }
        }

        let interval = nextInterval(stability: s.stability)
        s.lastInterval = interval
        s.lastReview = now
        s.due = now.addingTimeInterval(interval * 86400.0)
        s.reps += 1
        return s
    }

    /// Days until the card should next be reviewed.
    /// Derived from `S * (R^(-1/d) - 1) / ln(0.9)` simplified to the FSRS v4 form.
    public func nextInterval(stability: Double) -> Double {
        let interval = stability * (1.0 / params.requestRetention - 1.0)
        return min(max(interval, 1.0), params.maximumInterval).rounded()
    }

    private func clampDifficulty(_ d: Double) -> Double {
        min(max(d, 1.0), 10.0)
    }
}
