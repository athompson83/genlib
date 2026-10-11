// SPDX-License-Identifier: Apache-2.0
#if canImport(SwiftUI)
import SwiftUI
public enum InventoryViewState: Sendable, Equatable {
    case loading
    case ready
    case failed
}
public struct InventoryDashboard: View {
    public let state: InventoryViewState
    public let onRetry: () -> Void
    public init(state: InventoryViewState, onRetry: @escaping () -> Void) { self.state = state; self.onRetry = onRetry }
    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Inventory").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                switch state {
                case .loading:
                    Label("Loading inventory…", systemImage: "hourglass")
                        .accessibilityLabel("Loading inventory")
                    RoundedRectangle(cornerRadius: 8).fill(Color.secondary.opacity(0.15)).frame(height: 72)
                case .ready:
                    InventoryRow(title: "Ship integration", completed: true)
                    InventoryRow(title: "Review offline changes", completed: false)
                    Text("1 completed · All changes synced").font(.body)
                case .failed:
                    Label("Inventory could not load", systemImage: "exclamationmark.triangle")
                    Text("Your changes are safe on this device. Check your connection and try again.")
                    Button("Retry", action: onRetry).buttonStyle(.borderedProminent)
                }
            }.padding(24).frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
#endif
