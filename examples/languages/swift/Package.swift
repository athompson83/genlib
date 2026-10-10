// swift-tools-version:5.10
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "GenlibSwift",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "GenlibSwift", targets: ["GenlibSwift"]),
    ],
    dependencies: [
        // Only linked where CryptoKit is unavailable (Linux/Windows/Android); Apple platforms use CryptoKit.
        .package(url: "https://github.com/apple/swift-crypto.git", exact: "3.15.1"),
    ],
    targets: [
        .target(
            name: "GenlibSwift",
            dependencies: [
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux, .windows, .android])),
            ]
        ),
        // Dependency-free check runner (works without XCTest): `swift run GenlibSwiftChecks`.
        .executableTarget(name: "GenlibSwiftChecks", dependencies: ["GenlibSwift"]),
    ]
)
