import SwiftUI
import SwiftData
import ChessMemoCore

struct TacticsListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \TacticRecord.createdAt, order: .reverse) private var tactics: [TacticRecord]
    @State private var showingImport = false

    var body: some View {
        List {
            if tactics.isEmpty {
                ContentUnavailableView(
                    "No tactics yet",
                    systemImage: "target",
                    description: Text("Import a study or puzzle PGN to solve from the diagram.")
                )
            } else {
                ForEach(tactics) { t in
                    NavigationLink(value: t) { Text(t.name) }
                }
                .onDelete { idx in idx.forEach { context.delete(tactics[$0]) }; try? context.save() }
            }
        }
        .navigationTitle("Tactics")
        .toolbar {
            Button { showingImport = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $showingImport) {
            ImportView(kind: .tactics)
        }
        .navigationDestination(for: TacticRecord.self) { t in
            ContentDetailView(
                title: t.name,
                ownerId: t.id,
                pgnSource: t.pgnSource,
                mode: .tactics,
                userColor: nil
            )
        }
    }
}
