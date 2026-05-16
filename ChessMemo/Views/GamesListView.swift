import SwiftUI
import SwiftData
import ChessMemoCore

struct GamesListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \GameRecord.createdAt, order: .reverse) private var games: [GameRecord]
    @State private var showingImport = false

    var body: some View {
        List {
            if games.isEmpty {
                ContentUnavailableView(
                    "No games yet",
                    systemImage: "play.rectangle",
                    description: Text("Import an annotated game to drill both sides.")
                )
            } else {
                ForEach(games) { g in
                    NavigationLink(value: g) {
                        Text(g.displayTitle).font(.headline)
                    }
                }
                .onDelete { idx in idx.forEach { context.delete(games[$0]) }; try? context.save() }
            }
        }
        .navigationTitle("Games")
        .toolbar {
            Button { showingImport = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $showingImport) {
            ImportView(kind: .fullGame)
        }
        .navigationDestination(for: GameRecord.self) { g in
            ContentDetailView(
                title: g.displayTitle,
                ownerId: g.id,
                pgnSource: g.pgnSource,
                mode: .fullGame,
                userColor: nil
            )
        }
    }
}
