// swift-tools-version:5.9
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "RichTextSanitization",
    products: [.library(name: "RichTextSanitization", targets: ["RichTextSanitization"])],
    dependencies: [
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.14.1"),
    ],
    targets: [
        .target(name: "RichTextSanitization", dependencies: ["SwiftSoup"]),
        .testTarget(name: "RichTextSanitizationTests", dependencies: ["RichTextSanitization"]),
    ]
)
