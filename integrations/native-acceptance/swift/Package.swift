// swift-tools-version: 6.1
// SPDX-License-Identifier: Apache-2.0
import PackageDescription
let package = Package(
    name: "InventoryPresentation",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "InventoryPresentation", targets: ["InventoryPresentation"])],
    dependencies: [.package(url: "https://github.com/pointfreeco/swift-snapshot-testing", exact: "1.19.6")],
    targets: [
        .target(name: "InventoryPresentation"),
        .testTarget(name: "InventoryPresentationTests", dependencies: ["InventoryPresentation", .product(name: "SnapshotTesting", package: "swift-snapshot-testing")], exclude: ["__Snapshots__"])
    ]
)
