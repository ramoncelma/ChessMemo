import Foundation
import SwiftUI
import ChessMemoCore

/// User-facing settings persisted via UserDefaults.
/// (Kept out of SwiftData because it's a singleton; this is simpler.)
@MainActor
final class AppSettingsStore: ObservableObject {
    @AppStorage("onFailure") private var onFailureRaw: String = OnFailureBehaviour.showMoveAndComment.rawValue
    @AppStorage("allowRetry") var allowRetry: Bool = true
    @AppStorage("maxRetries") var maxRetries: Int = 1
    @AppStorage("engineDepth") var engineDepth: Int = 18

    var onFailure: OnFailureBehaviour {
        get { OnFailureBehaviour(rawValue: onFailureRaw) ?? .showMoveAndComment }
        set { onFailureRaw = newValue.rawValue }
    }

    var drillSettings: DrillSettings {
        DrillSettings(onFailure: onFailure, allowRetry: allowRetry, maxRetries: maxRetries)
    }
}

/// Lazily-constructed engine handle, shared across views.
@MainActor
final class EngineHolder: ObservableObject {
    let engine: UCIEngine = StubEngine()
}
