import SwiftUI
import ChessMemoCore

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettingsStore

    var body: some View {
        Form {
            Section("On wrong move") {
                Picker("Behaviour", selection: Binding(
                    get: { settings.onFailure },
                    set: { settings.onFailure = $0 })
                ) {
                    Text("Show correct move").tag(OnFailureBehaviour.showMove)
                    Text("Show move + comment").tag(OnFailureBehaviour.showMoveAndComment)
                    Text("Switch to lecture").tag(OnFailureBehaviour.autoLecture)
                }
                Toggle("Allow retries before failing", isOn: $settings.allowRetry)
                if settings.allowRetry {
                    Stepper("Retries: \(settings.maxRetries)", value: $settings.maxRetries, in: 0...5)
                }
            }
            Section("Engine") {
                Stepper("Default analysis depth: \(settings.engineDepth)", value: $settings.engineDepth, in: 8...30)
                Text("Stockfish runs on-device. Bundle the binary at Resources/stockfish.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Section("About") {
                Text("ChessMemo prototype — spaced repetition for PGN-driven study.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Settings")
    }
}
