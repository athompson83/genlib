// SPDX-License-Identifier: Apache-2.0
// Per-page text and document attributes with Apple PDFKit.
// Compiles on Apple platforms only; NOT compiled or run in Genlib's Linux checks.
import Foundation

public enum PdfTextError: Error {
    case unsupportedPlatform
    case unreadable
    case locked
}

public struct PdfTextResult {
    public let pages: [String]
    public let metadata: [String: String]
}

#if canImport(PDFKit)
import PDFKit

public enum PdfText {
    /// Image-only pages return "" (use Vision for OCR). Encrypted files: call
    /// `doc.unlock(withPassword:)` before reading.
    public static func extract(_ data: Data) throws -> PdfTextResult {
        guard let doc = PDFDocument(data: data) else { throw PdfTextError.unreadable }
        if doc.isLocked { throw PdfTextError.locked }
        let pages = (0..<doc.pageCount).map { doc.page(at: $0)?.string ?? "" }
        var meta: [String: String] = [:]
        let attrs = doc.documentAttributes ?? [:]
        let keys: [(String, PDFDocumentAttribute)] = [
            ("title", .titleAttribute), ("author", .authorAttribute), ("subject", .subjectAttribute),
            ("creator", .creatorAttribute), ("producer", .producerAttribute),
        ]
        for (name, key) in keys {
            if let v = attrs[key] as? String, !v.isEmpty { meta[name] = v }
        }
        return PdfTextResult(pages: pages, metadata: meta)
    }
}
#else
public enum PdfText {
    public static func extract(_ data: Data) throws -> PdfTextResult { throw PdfTextError.unsupportedPlatform }
}
#endif
