import Foundation

public enum PGNParseError: Error, CustomStringConvertible {
    case unexpectedEnd
    case unmatchedBrace
    case unmatchedParenthesis
    case unmatchedTagBracket

    public var description: String {
        switch self {
        case .unexpectedEnd:        return "Unexpected end of PGN input"
        case .unmatchedBrace:       return "Unmatched '{' in PGN comment"
        case .unmatchedParenthesis: return "Unmatched '(' in PGN variation"
        case .unmatchedTagBracket:  return "Unmatched '[' in PGN tag pair"
        }
    }
}

/// Parses one or more PGN games from a string.
///
/// Handles:
/// - Seven-tag roster and additional tag pairs.
/// - `{ comments }` (attached to the preceding move, or the root if before any move).
/// - `( variations )`, including nested variations.
/// - NAGs (`$1`, `$2`, …).
/// - Move numbers, side indicators (`1.`, `1...`), and result tokens.
///
/// Not (yet) handled:
/// - `;` end-of-line comments (treated as text by the lexer's whitespace skip).
/// - FEN setup tags (the root always represents the standard starting position).
public struct PGNParser {
    public init() {}

    public func parseAll(_ source: String) throws -> [PGNGame] {
        var scanner = Scanner(source: source)
        var games: [PGNGame] = []
        while let game = try parseGame(&scanner) {
            games.append(game)
        }
        return games
    }

    public func parseFirst(_ source: String) throws -> PGNGame? {
        var scanner = Scanner(source: source)
        return try parseGame(&scanner)
    }

    private func parseGame(_ scanner: inout Scanner) throws -> PGNGame? {
        scanner.skipWhitespaceAndLineComments()
        if scanner.isAtEnd { return nil }

        let tags = try parseTagPairs(&scanner)
        let root = PGNNode(move: nil, ply: 0)
        try parseMoveText(&scanner, parent: root, ply: 0)
        if tags.isEmpty, root.children.isEmpty { return nil }
        return PGNGame(tags: tags, root: root)
    }

    private func parseTagPairs(_ scanner: inout Scanner) throws -> [String: String] {
        var tags: [String: String] = [:]
        while true {
            scanner.skipWhitespaceAndLineComments()
            guard scanner.peek() == "[" else { break }
            scanner.advance()
            scanner.skipSpaces()
            let name = scanner.takeWhile { $0 != " " && $0 != "\"" && $0 != "]" }
            scanner.skipSpaces()
            guard scanner.peek() == "\"" else { throw PGNParseError.unmatchedTagBracket }
            scanner.advance()
            var value = ""
            while let c = scanner.peek(), c != "\"" {
                if c == "\\" {
                    scanner.advance()
                    if let esc = scanner.peek() { value.append(esc); scanner.advance() }
                } else {
                    value.append(c); scanner.advance()
                }
            }
            guard scanner.peek() == "\"" else { throw PGNParseError.unmatchedTagBracket }
            scanner.advance()
            scanner.skipSpaces()
            guard scanner.peek() == "]" else { throw PGNParseError.unmatchedTagBracket }
            scanner.advance()
            tags[name] = value
        }
        return tags
    }

    /// Recursively parses a move-text region. `parent` is the node onto which
    /// the next move should be appended as a child. Variations attach to the
    /// node before the variation's first move (i.e. the same parent).
    private func parseMoveText(_ scanner: inout Scanner, parent: PGNNode, ply: Int) throws {
        var current = parent
        var currentPly = ply

        while !scanner.isAtEnd {
            scanner.skipWhitespaceAndLineComments()
            guard let c = scanner.peek() else { break }

            switch c {
            case "{":
                let text = try readBraceComment(&scanner)
                current.comment = appendComment(current.comment, text)

            case "(":
                scanner.advance()
                guard let variationParent = current.parent else {
                    // Variation before any move: attach to root's first child slot.
                    // (Rare; PGN spec puts variations after a move.)
                    try parseMoveText(&scanner, parent: current, ply: currentPly)
                    continue
                }
                try parseMoveText(&scanner, parent: variationParent, ply: currentPly - 1)

            case ")":
                scanner.advance()
                return

            case "[":
                // Next game's tag pairs; bail out so caller can pick it up.
                return

            case "$":
                scanner.advance()
                let digits = scanner.takeWhile { $0.isASCII && $0.isNumber }
                if let nag = Int(digits) { current.nags.append(nag) }

            case "*", "1", "0", "½":
                // Could be a result token (1-0, 0-1, 1/2-1/2, *) or a move number.
                if let _ = readResultToken(&scanner) { return }
                // Otherwise it's a move number prefix like "1." — strip and continue.
                _ = scanner.takeWhile { $0.isASCII && ($0.isNumber || $0 == ".") }

            default:
                if c.isLetter || c == "O" {
                    let token = scanner.takeWhile { ch in
                        !ch.isWhitespace && ch != "(" && ch != ")" && ch != "{" && ch != "}" && ch != "$" && ch != "["
                    }
                    let san = stripMoveDecorations(token)
                    guard !san.isEmpty else { continue }
                    let node = PGNNode(move: san, ply: currentPly + 1, parent: current)
                    current.children.append(node)
                    current = node
                    currentPly += 1
                } else {
                    scanner.advance()
                }
            }
        }
    }

    private func appendComment(_ existing: String?, _ new: String) -> String {
        guard let e = existing, !e.isEmpty else { return new }
        return e + " " + new
    }

    private func readBraceComment(_ scanner: inout Scanner) throws -> String {
        scanner.advance() // consume {
        var text = ""
        while let c = scanner.peek() {
            if c == "}" { scanner.advance(); return text.trimmingCharacters(in: .whitespacesAndNewlines) }
            text.append(c)
            scanner.advance()
        }
        throw PGNParseError.unmatchedBrace
    }

    private func readResultToken(_ scanner: inout Scanner) -> String? {
        let saved = scanner
        let token = scanner.takeWhile { !$0.isWhitespace && $0 != ")" }
        switch token {
        case "1-0", "0-1", "1/2-1/2", "½-½", "*":
            return token
        default:
            scanner = saved
            return nil
        }
    }

    private func stripMoveDecorations(_ token: String) -> String {
        // Strip trailing check/mate marks and annotation glyphs; keep the SAN core.
        var s = token
        while let last = s.last, "+#?!".contains(last) {
            s.removeLast()
        }
        return s
    }
}

/// A tiny scanner over a Swift String. Operates on Character to keep parsing simple;
/// PGN files are small enough that this is not a hot path.
private struct Scanner {
    let chars: [Character]
    var index: Int = 0

    init(source: String) { self.chars = Array(source) }

    var isAtEnd: Bool { index >= chars.count }

    func peek() -> Character? { isAtEnd ? nil : chars[index] }

    mutating func advance() { index += 1 }

    mutating func skipSpaces() {
        while let c = peek(), c == " " || c == "\t" { advance() }
    }

    mutating func skipWhitespaceAndLineComments() {
        while let c = peek() {
            if c.isWhitespace { advance(); continue }
            if c == ";" {
                while let c = peek(), c != "\n" { advance() }
                continue
            }
            break
        }
    }

    mutating func takeWhile(_ pred: (Character) -> Bool) -> String {
        var out = ""
        while let c = peek(), pred(c) { out.append(c); advance() }
        return out
    }
}
