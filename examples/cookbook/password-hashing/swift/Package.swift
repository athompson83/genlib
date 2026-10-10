// swift-tools-version:6.0
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "Passwords",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "Passwords", targets: ["Passwords"])],
    dependencies: [
        // Argon2 reference C implementation (CC0-1.0 OR Apache-2.0), the same code
        // argon2-cffi bundles. No release tag carries Package.swift, so pin the commit.
        .package(url: "https://github.com/P-H-C/phc-winner-argon2.git", revision: "f57e61e19229e23c4445b85494dbf7c07de721cb"),
    ],
    targets: [
        .target(name: "Passwords", dependencies: [.product(name: "argon2", package: "phc-winner-argon2")]),
        .testTarget(name: "PasswordsTests", dependencies: ["Passwords"]),
    ]
)
