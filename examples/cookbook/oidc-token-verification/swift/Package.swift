// swift-tools-version:6.0
// SPDX-License-Identifier: Apache-2.0
import PackageDescription

let package = Package(
    name: "OidcVerify",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [.library(name: "OidcVerify", targets: ["OidcVerify"])],
    dependencies: [
        .package(url: "https://github.com/vapor/jwt-kit.git", exact: "5.7.1"),
    ],
    targets: [
        .target(name: "OidcVerify", dependencies: [.product(name: "JWTKit", package: "jwt-kit")]),
        .testTarget(name: "OidcVerifyTests", dependencies: ["OidcVerify", .product(name: "JWTKit", package: "jwt-kit")]),
    ]
)
