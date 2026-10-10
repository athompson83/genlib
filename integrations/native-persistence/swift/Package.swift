// swift-tools-version: 6.1
// SPDX-License-Identifier: Apache-2.0
import PackageDescription
let package = Package(
    name: "InventoryStore",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "InventoryStore", targets: ["InventoryStore"])],
    dependencies: [.package(url: "https://github.com/groue/GRDB.swift", exact: "7.11.1")],
    targets: [
        .target(name: "InventoryStore", dependencies: [.product(name: "GRDB", package: "GRDB.swift")]),
        .testTarget(name: "InventoryStoreTests", dependencies: ["InventoryStore", .product(name: "GRDB", package: "GRDB.swift")])
    ]
)
