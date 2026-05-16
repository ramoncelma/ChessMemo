import SwiftUI
import ChessMemoCore

/// On-demand Stockfish analysis. The engine is held in the environment so
/// switching to the real `StockfishProcess` later is a one-line change.
struct AnalysisView: View {
    let game: PGNGame

    @EnvironmentObject private var engineHolder: EngineHolder
    @EnvironmentObject private var settings: AppSettingsStore

    @State private var board = Board()
    @State private var path: [PGNNode] = []
    @State private var current: PGNNode?
    @State private var evaluation: EngineEvaluation?
    @State private var isAnalysing = false
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            BoardView(
                board: board,
                orientation: .white,
                highlightedSquares: [],
                onMove: { _, _ in }
            )
            .padding(.horizontal)

            evalCard

            HStack(spacing: 16) {
                Button { stepBack() } label: { Image(systemName: "backward.frame.fill") }
                    .disabled(path.isEmpty)
                Button { stepForward() } label: { Image(systemName: "forward.frame.fill") }
                    .disabled(current?.mainline == nil)
                Spacer()
                Button {
                    Task { await analyse() }
                } label: {
                    if isAnalysing { ProgressView() } else { Label("Analyse", systemImage: "play.fill") }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isAnalysing)
            }
            .font(.system(size: 24))
            .padding(.horizontal)

            Spacer()
        }
        .navigationTitle("Analysis")
        .task { current = game.root }
    }

    private var evalCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let eval = evaluation {
                Text(format(eval)).font(.title3.monospaced())
                if !eval.pv.isEmpty {
                    Text("PV: \(eval.pv.prefix(6).joined(separator: " "))")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                Text("Depth \(eval.depth)").font(.caption).foregroundStyle(.secondary)
            } else if let error {
                Text(error).foregroundStyle(.red)
            } else {
                Text("Tap Analyse to evaluate this position.")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private func format(_ eval: EngineEvaluation) -> String {
        if let mate = eval.mateIn { return "Mate in \(mate)" }
        if let cp = eval.centipawns {
            let sign = cp >= 0 ? "+" : ""
            return "\(sign)\(Double(cp) / 100.0)"
        }
        return "—"
    }

    private func analyse() async {
        isAnalysing = true
        defer { isAnalysing = false }
        do {
            try await engineHolder.engine.start()
            let eval = try await engineHolder.engine.evaluate(fen: board.fen, depth: settings.engineDepth)
            evaluation = eval
        } catch {
            self.error = "\(error)"
        }
    }

    private func stepForward() {
        guard let n = current, let next = n.mainline, let san = next.move else { return }
        try? board.applySAN(san)
        path.append(n)
        current = next
        evaluation = nil
    }

    private func stepBack() {
        guard let prev = path.popLast() else { return }
        var b = Board()
        var cur: PGNNode = game.root
        while cur.id != prev.id {
            guard let next = cur.mainline, let san = next.move else { break }
            try? b.applySAN(san)
            cur = next
        }
        board = b
        current = prev
        evaluation = nil
    }
}
