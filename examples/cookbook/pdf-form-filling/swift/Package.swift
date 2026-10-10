// swift-tools-version:5.9
// SPDX-License-Identifier: Apache-2.0
// PDFKit ships with macOS/iOS only. On Linux this package builds a stub that
// throws `PdfFormsError.unsupportedPlatform`.
import PackageDescription

let package = Package(
    name: "PdfForms",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [.library(name: "PdfForms", targets: ["PdfForms"])],
    targets: [.target(name: "PdfForms")]
)
