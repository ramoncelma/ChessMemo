import XCTest
@testable import ChessMemoCore

final class BoardTests: XCTestCase {

    func testStartingFEN() {
        let b = Board()
        XCTAssertEqual(b.fen, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    }

    func testReplayOpening() throws {
        var b = Board()
        for san in ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"] {
            try b.applySAN(san)
        }
        XCTAssertEqual(b.sideToMove, .white)
        XCTAssertEqual(b[Square("b5")!]?.kind, .bishop)
        XCTAssertEqual(b[Square("a6")!]?.kind, .pawn)
    }

    func testCastling() throws {
        var b = Board()
        for san in ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"] {
            try b.applySAN(san)
        }
        XCTAssertEqual(b[Square("g1")!]?.kind, .king)
        XCTAssertEqual(b[Square("f1")!]?.kind, .rook)
        XCTAssertEqual(b[Square("h1")!], nil)
        XCTAssertEqual(b[Square("e1")!], nil)
    }

    func testCoordinateMoveProducesSAN() throws {
        var b = Board()
        let san = try b.applyMove(from: Square("e2")!, to: Square("e4")!)
        XCTAssertEqual(san, "e4")
    }
}
