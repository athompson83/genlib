// swift-tools-version:5.9
// SPDX-License-Identifier: Apache-2.0
// PDFKit ships with macOS/iOS only. On Linux this package builds a stub that
// throws `PdfTextError.unsupportedPlatform`.
import PackageDescription

let package = Package(
    name: "PdfText",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [.library(name: "PdfText", targets: ["PdfText"])],
    targets: [.target(name: "PdfText")]
)
