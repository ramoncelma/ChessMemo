import XCTest
@testable import ChessMemoCore

final class FSRSTests: XCTestCase {

    func testFirstReviewGoodSchedulesFuture() {
        let fsrs = FSRS()
        let now = Date(timeIntervalSince1970: 0)
        let s = fsrs.schedule(CardState(), rating: .good, now: now)
        XCTAssertEqual(s.reps, 1)
        XCTAssertNotNil(s.due)
        XCTAssertGreaterThan(s.due!, now)
        XCTAssertGreaterThanOrEqual(s.lastInterval, 1)
    }

    func testAgainResetsStability() {
        let fsrs = FSRS()
        var s = fsrs.schedule(CardState(), rating: .good)
        let stabilityAfterGood = s.stability
        s = fsrs.schedule(s, rating: .again)
        XCTAssertLessThan(s.stability, stabilityAfterGood)
        XCTAssertEqual(s.lapses, 1)
    }

    func testEasyGivesLongerIntervalThanGood() {
        let fsrs = FSRS()
        let good = fsrs.schedule(CardState(), rating: .good)
        let easy = fsrs.schedule(CardState(), rating: .easy)
        XCTAssertGreaterThanOrEqual(easy.lastInterval, good.lastInterval)
    }

    func testDifficultyClamped() {
        let fsrs = FSRS()
        var s = CardState()
        for _ in 0..<20 {
            s = fsrs.schedule(s, rating: .again)
        }
        XCTAssertLessThanOrEqual(s.difficulty, 10.0)
        XCTAssertGreaterThanOrEqual(s.difficulty, 1.0)
    }
}
