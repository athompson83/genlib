// SPDX-License-Identifier: Apache-2.0
#if canImport(SwiftUI)
import SwiftUI
public struct InventoryRow: View {
    public let title: String
    public let completed: Bool
    public init(title: String, completed: Bool) { self.title = title; self.completed = completed }
    public var body: some View {
        HStack {
            Image(systemName: completed ? "checkmark.circle.fill" : "circle")
                .accessibilityHidden(true)
            Text(title).font(.body)
            Spacer()
        }.padding().accessibilityElement(children: .ignore)
            .accessibilityLabel(title).accessibilityValue(completed ? "Completed" : "Open")
    }
}
#endif
