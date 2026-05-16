import SwiftUI
import ChessMemoCore

/// Non-interactive variation browser. Replays moves on a board, shows the
/// PGN comment + NAGs for the current node, and lets the user step through
/// any branch.
struct LectureView: View {
    let game: PGNGame
    var startAt: PGNNode?

    @State private var path: [PGNNode] = []
    @State private var board = Board()
    @State private var current: PGNNode?
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            BoardView(
                board: board,
                orientation: .white,
                highlightedSquares: [],
                onMove: { _, _ in } // non-interactive
            )
            .padding(.horizontal)

            if let current {
                infoCard(node: current)
            }

            controlBar
        }
        .navigationTitle("Lecture")
        .task { reset() }
    }

    private func infoCard(node: PGNNode) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let move = node.move {
                Text("Move \(node.ply / 2 + 1)\(node.ply % 2 == 1 ? "." : "...") \(move)")
                    .font(.headline)
            } else {
                Text("Starting position").font(.headline)
            }
            if !node.nags.isEmpty {
                Text("NAGs: \(node.nags.map { "$\($0)" }.joined(separator: " "))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let comment = node.comment, !comment.isEmpty {
                Text(comment).font(.callout)
            }
            if node.children.count > 1 {
                let variations = node.children.dropFirst()
                Text("Variations: \(variations.compactMap { $0.move }.joined(separator: ", "))")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private var controlBar: some View {
        HStack(spacing: 24) {
            Button { stepBack() } label: { Image(systemName: "backward.frame.fill") }
                .disabled(path.isEmpty)
            Button { stepForward() } label: { Image(systemName: "forward.frame.fill") }
                .disabled(current?.mainline == nil)
        }
        .font(.system(size: 28))
        .padding()
    }

    // MARK: - Navigation

    private func reset() {
        board = Board()
        current = game.root
        path = []
        // If startAt is set, replay up to it.
        if let target = startAt {
            replay(toward: target)
        }
    }

    private func replay(toward target: PGNNode) {
        // Walk from root following mainline only (simplified).
        var cur: PGNNode? = game.root
        while let n = cur, n.id != target.id {
            guard let next = n.mainline, let san = next.move else { break }
            do {
                try board.applySAN(san)
                path.append(n)
                cur = next
            } catch {
                self.error = "\(error)"
                return
            }
        }
        current = cur
    }

    private func stepForward() {
        guard let n = current, let next = n.mainline, let san = next.move else { return }
        do {
            try board.applySAN(san)
            path.append(n)
            current = next
        } catch {
            self.error = "\(error)"
        }
    }

    private func stepBack() {
        guard let prev = path.popLast() else { return }
        // Rebuild board by replaying from root — cheap for typical PGN lengths.
        var b = Board()
        var p: [PGNNode] = []
        var cur: PGNNode = game.root
        while cur.id != prev.id {
            guard let next = cur.mainline, let san = next.move else { break }
            try? b.applySAN(san)
            p.append(cur)
            cur = next
        }
        board = b
        path = p
        current = prev
    }
}
