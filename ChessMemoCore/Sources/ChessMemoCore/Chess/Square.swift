import Foundation

/// A board square indexed 0...63 from a1 (0) to h8 (63), file-major.
public struct Square: Hashable, Sendable, CustomStringConvertible {
    public let index: Int

    public init?(_ index: Int) {
        guard (0..<64).contains(index) else { return nil }
        self.index = index
    }

    public init?(file: Int, rank: Int) {
        guard (0..<8).contains(file), (0..<8).contains(rank) else { return nil }
        self.index = rank * 8 + file
    }

    public init?(_ algebraic: String) {
        guard algebraic.count == 2 else { return nil }
        let chars = Array(algebraic.lowercased())
        guard let f = chars[0].asciiValue, let r = chars[1].asciiValue else { return nil }
        let file = Int(f) - Int(Character("a").asciiValue!)
        let rank = Int(r) - Int(Character("1").asciiValue!)
        self.init(file: file, rank: rank)
    }

    public var file: Int { index % 8 }
    public var rank: Int { index / 8 }

    public var description: String {
        let f = Character(UnicodeScalar(UInt8(file) + Character("a").asciiValue!))
        let r = Character(UnicodeScalar(UInt8(rank) + Character("1").asciiValue!))
        return "\(f)\(r)"
    }
}
