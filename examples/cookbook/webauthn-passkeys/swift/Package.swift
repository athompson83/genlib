// swift-tools-version:6.0
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "Passkeys",
    platforms: [.macOS(.v13)],
    products: [.library(name: "Passkeys", targets: ["Passkeys"])],
    dependencies: [
        // swift-server/webauthn-swift (Apache-2.0). Pre-1.0: pin exactly and review on upgrade.
        .package(url: "https://github.com/swift-server/webauthn-swift.git", exact: "1.0.0-beta.1"),
    ],
    targets: [
        .target(name: "Passkeys", dependencies: [.product(name: "WebAuthn", package: "webauthn-swift")]),
        .testTarget(name: "PasskeysTests", dependencies: ["Passkeys"]),
    ]
)
