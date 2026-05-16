import SwiftUI
import SwiftData
import ChessMemoCore

struct ContentView: View {
    var body: some View {
        TabView {
            NavigationStack { RepertoireListView() }
                .tabItem { Label("Repertoires", systemImage: "books.vertical") }

            NavigationStack { GamesListView() }
                .tabItem { Label("Games", systemImage: "play.rectangle") }

            NavigationStack { TacticsListView() }
                .tabItem { Label("Tactics", systemImage: "target") }

            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}

#Preview {
    ContentView()
        .modelContainer(for: [Repertoire.self, GameRecord.self, TacticRecord.self, CardRecord.self, ReviewLog.self], inMemory: true)
        .environmentObject(AppSettingsStore())
        .environmentObject(EngineHolder())
}
