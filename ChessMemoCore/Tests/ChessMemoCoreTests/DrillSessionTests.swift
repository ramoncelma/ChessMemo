import XCTest
@testable import ChessMemoCore

final class DrillSessionTests: XCTestCase {

    private func sampleGame() throws -> PGNGame {
        let pgn = "1. e4 e5 2. Nf3 Nc6 {a comment} 3. Bb5 1-0"
        return try XCTUnwrap(try PGNParser().parseFirst(pgn))
    }

    func testCorrectMovesAdvance() throws {
        let game = try sampleGame()
        let session = DrillSession(
            rootNode: game.root,
            mode: .fullGame,
            settings: .default
        )
        for san in ["e4", "e5", "Nf3"] {
            let outcome = try session.submit(san: san)
            if case .correct = outcome.kind { continue } else {
                XCTFail("Expected .correct for \(san), got \(outcome.kind)")
            }
        }
    }

    func testIncorrectMoveConsumesRetry() throws {
        let game = try sampleGame()
        let session = DrillSession(
            rootNode: game.root,
            mode: .fullGame,
            settings: DrillSettings(onFailure: .showMove, allowRetry: true, maxRetries: 1)
        )
        let outcome = try session.submit(san: "d4")
        if case .incorrectRetry(let left) = outcome.kind {
            XCTAssertEqual(left, 0)
        } else { XCTFail("Expected retry, got \(outcome.kind)") }
    }

    func testFinalFailureSurfacesComment() throws {
        let game = try sampleGame()
        let session = DrillSession(
            rootNode: game.root,
            mode: .fullGame,
            settings: DrillSettings(onFailure: .showMoveAndComment, allowRetry: false, maxRetries: 0)
        )
        try session.submit(san: "e4")           // correct
        try session.submit(san: "e5")           // correct
        try session.submit(san: "Nf3")          // correct
        let bad = try session.submit(san: "h6") // expected Nc6
        if case .incorrectFinal(let correct, let comment) = bad.kind {
            XCTAssertEqual(correct, "Nc6")
            XCTAssertEqual(comment, "a comment")
        } else {
            XCTFail("Expected incorrectFinal, got \(bad.kind)")
        }
    }

    func testRepertoireModeAutoPlaysOpponent() throws {
        let game = try sampleGame()
        // User plays Black: opponent (White) plays first.
        let session = DrillSession(
            rootNode: game.root,
            mode: .repertoire,
            userColor: .black
        )
        XCTAssertFalse(session.isUserTurn)
        try session.autoPlayOpponentIfNeeded() // plays e4
        XCTAssertTrue(session.isUserTurn)
        let outcome = try session.submit(san: "e5")
        if case .correct = outcome.kind {} else { XCTFail("expected correct") }
    }
}
