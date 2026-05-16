import SwiftUI
import ChessMemoCore

/// Entry-point screen for any content item (Repertoire / Game / Tactic).
/// Lets the user pick between Drill, Lecture, and Analysis.
struct ContentDetailView: View {
    let title: String
    let ownerId: UUID
    let pgnSource: String
    let mode: DrillMode
    let userColor: PieceColor?

    @State private var parsed: PGNGame?
    @State private var parseError: String?

    var body: some View {
        VStack(spacing: 24) {
            if let parseError {
                ContentUnavailableView("Could not parse PGN", systemImage: "exclamationmark.triangle", description: Text(parseError))
            } else if let game = parsed {
                summary(for: game)
                actionButtons(for: game)
            } else {
                ProgressView()
            }
            Spacer()
        }
        .padding()
        .navigationTitle(title)
        .task { parse() }
    }

    @ViewBuilder
    private func summary(for game: PGNGame) -> some View {
        let nodes = game.root.allNodes().filter { $0.move != nil }
        VStack(alignment: .leading, spacing: 8) {
            Text(game.displayTitle).font(.headline)
            Text("Mainline length: \(game.root.mainlineNodes().count - 1) plies")
                .foregroundStyle(.secondary)
            Text("Total moves in tree (incl. variations): \(nodes.count)")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func actionButtons(for game: PGNGame) -> some View {
        VStack(spacing: 12) {
            NavigationLink {
                DrillView(ownerId: ownerId, mode: mode, userColor: userColor, game: game)
            } label: {
                Label("Drill", systemImage: "brain.head.profile")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            NavigationLink {
                LectureView(game: game)
            } label: {
                Label("Lecture", systemImage: "text.book.closed")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)

            NavigationLink {
                AnalysisView(game: game)
            } label: {
                Label("Analysis", systemImage: "chart.line.uptrend.xyaxis")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
    }

    private func parse() {
        do {
            parsed = try PGNParser().parseFirst(pgnSource)
            if parsed == nil { parseError = "PGN contained no game." }
        } catch {
            parseError = "\(error)"
        }
    }
}
