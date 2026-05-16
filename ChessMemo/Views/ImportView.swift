import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import ChessMemoCore

enum ImportKind {
    case repertoire, fullGame, tactics
}

struct ImportView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let kind: ImportKind

    @State private var name: String = ""
    @State private var userColor: PieceColor = .white
    @State private var pgnText: String = ""
    @State private var importer = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Details") {
                    TextField("Name", text: $name)
                    if kind == .repertoire {
                        Picker("You play", selection: $userColor) {
                            Text("White").tag(PieceColor.white)
                            Text("Black").tag(PieceColor.black)
                        }
                    }
                }
                Section("PGN") {
                    TextEditor(text: $pgnText)
                        .frame(minHeight: 180)
                        .font(.system(.body, design: .monospaced))
                    Button("Pick PGN file…") { importer = true }
                }
                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Import") { performImport() }
                        .disabled(pgnText.isEmpty || name.isEmpty)
                }
            }
            .fileImporter(
                isPresented: $importer,
                allowedContentTypes: [.plainText, UTType(filenameExtension: "pgn") ?? .plainText]
            ) { result in
                switch result {
                case .success(let url):
                    if url.startAccessingSecurityScopedResource() {
                        defer { url.stopAccessingSecurityScopedResource() }
                        pgnText = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
                        if name.isEmpty { name = url.deletingPathExtension().lastPathComponent }
                    }
                case .failure(let e):
                    error = e.localizedDescription
                }
            }
        }
    }

    private var title: String {
        switch kind {
        case .repertoire: return "New Repertoire"
        case .fullGame:   return "New Game"
        case .tactics:    return "New Tactic"
        }
    }

    private func performImport() {
        do {
            // Validate by parsing once. We keep the raw PGN as source-of-truth.
            _ = try PGNParser().parseFirst(pgnText)
        } catch {
            self.error = "PGN parse failed: \(error)"
            return
        }

        switch kind {
        case .repertoire:
            context.insert(Repertoire(name: name, userColor: userColor, pgnSource: pgnText))
        case .fullGame:
            context.insert(GameRecord(displayTitle: name, pgnSource: pgnText))
        case .tactics:
            context.insert(TacticRecord(name: name, pgnSource: pgnText))
        }
        try? context.save()
        dismiss()
    }
}
