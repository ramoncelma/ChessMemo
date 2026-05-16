import XCTest
@testable import ChessMemoCore

final class PGNParserTests: XCTestCase {

    func testParsesSimpleGame() throws {
        let pgn = """
        [Event "Test"]
        [White "Alice"]
        [Black "Bob"]

        1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0
        """
        let parser = PGNParser()
        let games = try parser.parseAll(pgn)
        XCTAssertEqual(games.count, 1)
        let g = games[0]
        XCTAssertEqual(g.tags["White"], "Alice")
        XCTAssertEqual(g.tags["Black"], "Bob")
        let mainline = g.root.mainlineNodes().compactMap { $0.move }
        XCTAssertEqual(mainline, ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"])
    }

    func testParsesCommentAndVariation() throws {
        let pgn = """
        [Event "T"]

        1. e4 e5 (1... c5 {the Sicilian} 2. Nf3) 2. Nf3 {develops}
        """
        let game = try XCTUnwrap(try PGNParser().parseFirst(pgn))
        let mainline = game.root.mainlineNodes().compactMap { $0.move }
        XCTAssertEqual(mainline, ["e4", "e5", "Nf3"])

        // The second node (e5) should have a sibling starting with c5.
        let e4 = game.root.children[0]
        XCTAssertEqual(e4.children.count, 2, "e4 should have e5 and the variation c5")
        let c5Variation = e4.children[1]
        XCTAssertEqual(c5Variation.move, "c5")
        XCTAssertEqual(c5Variation.comment, "the Sicilian")

        // The Nf3 mainline node should carry the {develops} comment.
        let nf3 = game.root.mainlineNodes().last
        XCTAssertEqual(nf3?.comment, "develops")
    }

    func testParsesNAGs() throws {
        let pgn = "1. e4 $1 e5 $2 *"
        let game = try XCTUnwrap(try PGNParser().parseFirst(pgn))
        let e4 = game.root.children[0]
        XCTAssertEqual(e4.nags, [1])
        XCTAssertEqual(e4.mainline?.nags, [2])
    }

    func testStripsCheckAndMateGlyphs() throws {
        let pgn = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7# 1-0"
        let game = try XCTUnwrap(try PGNParser().parseFirst(pgn))
        let last = game.root.mainlineNodes().last!
        XCTAssertEqual(last.move, "Qxf7")
    }
}
