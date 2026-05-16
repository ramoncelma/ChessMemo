import SwiftUI
import SwiftData
import ChessMemoCore

struct RepertoireListView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Repertoire.createdAt, order: .reverse) private var repertoires: [Repertoire]
    @State private var showingImport = false

    var body: some View {
        List {
            if repertoires.isEmpty {
                ContentUnavailableView(
                    "No repertoires yet",
                    systemImage: "books.vertical",
                    description: Text("Import a PGN file to start drilling.")
                )
            } else {
                ForEach(repertoires) { rep in
                    NavigationLink(value: rep) {
                        VStack(alignment: .leading) {
                            Text(rep.name).font(.headline)
                            Text("Plays \(rep.userColor.rawValue.capitalized)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete(perform: delete)
            }
        }
        .navigationTitle("Repertoires")
        .toolbar {
            Button { showingImport = true } label: { Image(systemName: "plus") }
        }
        .sheet(isPresented: $showingImport) {
            ImportView(kind: .repertoire)
        }
        .navigationDestination(for: Repertoire.self) { rep in
            ContentDetailView(
                title: rep.name,
                ownerId: rep.id,
                pgnSource: rep.pgnSource,
                mode: .repertoire,
                userColor: rep.userColor
            )
        }
    }

    private func delete(at offsets: IndexSet) {
        for i in offsets { context.delete(repertoires[i]) }
        try? context.save()
    }
}
