import SwiftUI
import SwiftData
import ChessMemoCore

struct DrillView: View {
    let ownerId: UUID
    let mode: DrillMode
    let userColor: PieceColor?
    let game: PGNGame

    @Environment(\.modelContext) private var context
    @EnvironmentObject private var settings: AppSettingsStore

    @State private var session: DrillSession?
    @State private var feedback: Feedback?
    @State private var showLecture = false
    @State private var error: String?

    enum Feedback: Equatable {
        case correct
        case retry(left: Int)
        case revealed(san: String, comment: String?)
    }

    var body: some View {
        VStack(spacing: 16) {
            if let session {
                BoardView(
                    board: session.board,
                    orientation: userColor ?? .white,
                    highlightedSquares: [],
                    onMove: { from, to in handleMove(from: from, to: to) }
                )
                .padding(.horizontal)

                statusBar(session: session)

                if let feedback { feedbackBar(feedback) }

                Spacer()
            } else if let error {
                Text(error).foregroundStyle(.red)
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Drill")
        .toolbar {
            Button { showLecture = true } label: {
                Image(systemName: "text.book.closed")
            }
        }
        .sheet(isPresented: $showLecture) {
            NavigationStack { LectureView(game: game, startAt: session?.current) }
        }
        .task { start() }
    }

    // MARK: - Status / feedback bars

    private func statusBar(session: DrillSession) -> some View {
        HStack {
            Text(modeLabel)
                .font(.caption)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(.thinMaterial, in: Capsule())
            Spacer()
            Text(session.isUserTurn ? "Your move" : "Opponent…")
                .font(.subheadline.weight(.medium))
        }
        .padding(.horizontal)
    }

    private func feedbackBar(_ feedback: Feedback) -> some View {
        Group {
            switch feedback {
            case .correct:
                Label("Correct", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            case .retry(let left):
                Label("Try again — \(left) retries left", systemImage: "arrow.uturn.backward")
                    .foregroundStyle(.orange)
            case .revealed(let san, let comment):
                VStack(alignment: .leading, spacing: 6) {
                    Label("Correct move: \(san)", systemImage: "info.circle")
                        .foregroundStyle(.red)
                    if let comment {
                        Text(comment).font(.callout).foregroundStyle(.secondary)
                    }
                    Button("Continue") { advancePastFailure() }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal)
    }

    private var modeLabel: String {
        switch mode {
        case .repertoire: return "Repertoire · \((userColor ?? .white).rawValue.capitalized)"
        case .fullGame:   return "Full Game · Both sides"
        case .tactics:    return "Tactic · Side to move"
        }
    }

    // MARK: - Lifecycle

    private func start() {
        let initialBoard = Board() // TODO: derive from PGN [FEN "..."] tag if present
        let s = DrillSession(
            rootNode: game.root,
            mode: mode,
            userColor: userColor,
            settings: settings.drillSettings,
            initialBoard: initialBoard
        )
        do {
            try s.autoPlayOpponentIfNeeded()
        } catch {
            self.error = "\(error)"
        }
        session = s
    }

    // MARK: - Move handling

    private func handleMove(from: Square, to: Square) {
        guard let session else { return }
        guard session.isUserTurn else { return }

        // Translate tap-to-tap into SAN using a scratch board copy.
        var scratch = session.board
        let userSAN: String
        do {
            userSAN = try scratch.applyMove(from: from, to: to)
        } catch {
            self.error = "\(error)"
            return
        }

        do {
            let outcome = try session.submit(san: userSAN)
            switch outcome.kind {
            case .correct:
                feedback = .correct
                try session.autoPlayOpponentIfNeeded()
                Task {
                    try? await Task.sleep(nanoseconds: 350_000_000)
                    await MainActor.run { feedback = nil }
                }
                self.error = nil
            case .incorrectRetry(let left):
                feedback = .retry(left: left)
            case .incorrectFinal(let san, let comment):
                handleFinalFailure(correctSAN: san, comment: comment)
            case .done:
                feedback = .correct
                recordRating()
            }
        } catch {
            self.error = "\(error)"
        }
    }

    private func handleFinalFailure(correctSAN: String, comment: String?) {
        switch settings.onFailure {
        case .showMove:
            feedback = .revealed(san: correctSAN, comment: nil)
        case .showMoveAndComment:
            feedback = .revealed(san: correctSAN, comment: comment)
        case .autoLecture:
            showLecture = true
        }
    }

    private func advancePastFailure() {
        guard let session else { return }
        do {
            try session.skipToNext()
            try session.autoPlayOpponentIfNeeded()
            feedback = nil
        } catch {
            self.error = "\(error)"
        }
    }

    private func recordRating() {
        guard let session else { return }
        let scheduler = CardScheduler(context: context)
        do {
            // Walk back through the line and record one card per user-side move.
            // Simplified: just record a single rating for the whole line at the
            // final node's parent. A real implementation would persist a card
            // per (fenBeforeMove, expectedSAN) tuple.
            if let parent = session.current.parent, let san = session.current.move {
                let card = try scheduler.findOrCreate(
                    ownerId: ownerId,
                    fen: "", // TODO: track FEN per ply; uses empty key for prototype
                    expectedSAN: san
                )
                _ = parent
                try scheduler.record(card, rating: session.suggestedRating())
            }
        } catch {
            self.error = "\(error)"
        }
    }
}
