// swift-tools-version:5.9
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "RichTextSanitization",
    // SwiftSoup 2.14 requires macOS 12 / iOS 15.
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [.library(name: "RichTextSanitization", targets: ["RichTextSanitization"])],
    dependencies: [
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.14.1"),
    ],
    targets: [
        .target(name: "RichTextSanitization", dependencies: ["SwiftSoup"]),
        .testTarget(name: "RichTextSanitizationTests", dependencies: ["RichTextSanitization"]),
    ]
)
