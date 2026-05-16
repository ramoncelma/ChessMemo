import SwiftUI
import SwiftData
import ChessMemoCore

@main
struct ChessMemoApp: App {
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(
                for: Repertoire.self, GameRecord.self, TacticRecord.self, CardRecord.self, ReviewLog.self
            )
        } catch {
            fatalError("Failed to initialise SwiftData: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .modelContainer(container)
                .environmentObject(AppSettingsStore())
                .environmentObject(EngineHolder())
        }
    }
}
