// SPDX-License-Identifier: Apache-2.0
// AcroForm list/fill with Apple PDFKit.
// Compiles on Apple platforms only; NOT compiled or run in Genlib's Linux checks.
import Foundation

public enum PdfFormsError: Error {
    case unsupportedPlatform
    case unreadable
    case unknownField(String)
    case invalidValue(String)
}

public struct FormField: Equatable {
    public let name: String
    public let kind: String  // "text", "checkbox", "choice", "radio" or "other"
    public let value: String?
    public let options: [String]
}

#if canImport(PDFKit)
import PDFKit

public enum PdfForms {
    /// Widget annotations grouped by field name (a field can have several widgets).
    private static func widgets(_ doc: PDFDocument) -> [String: [PDFAnnotation]] {
        var out: [String: [PDFAnnotation]] = [:]
        for i in 0..<doc.pageCount {
            for a in doc.page(at: i)?.annotations ?? [] where a.type == "Widget" {
                if let name = a.fieldName { out[name, default: []].append(a) }
            }
        }
        return out
    }

    private static func describe(_ name: String, _ a: PDFAnnotation) -> FormField {
        switch a.widgetFieldType {
        case .text:
            return FormField(name: name, kind: "text", value: a.widgetStringValue, options: [])
        case .button where a.widgetControlType == .checkBoxControl:
            return FormField(name: name, kind: "checkbox", value: a.buttonWidgetState == .onState ? "on" : "off", options: [])
        case .button where a.widgetControlType == .radioButtonControl:
            return FormField(name: name, kind: "radio", value: a.widgetStringValue, options: [])
        case .choice:
            return FormField(name: name, kind: "choice", value: a.widgetStringValue, options: a.choices ?? [])
        default:
            return FormField(name: name, kind: "other", value: a.widgetStringValue, options: [])
        }
    }

    public static func listFields(_ data: Data) throws -> [FormField] {
        guard let doc = PDFDocument(data: data) else { throw PdfFormsError.unreadable }
        return widgets(doc).sorted { $0.key < $1.key }.compactMap { name, ws in ws.first.map { describe(name, $0) } }
    }

    /// Fills by field name: String for text/choice, Bool for checkboxes. Validates
    /// all names and options before changing anything. `flatten` is not offered:
    /// PDFKit has no public form-flatten API (render pages to a new PDF instead).
    public static func fill(_ data: Data, values: [String: Any]) throws -> Data {
        guard let doc = PDFDocument(data: data) else { throw PdfFormsError.unreadable }
        let byName = widgets(doc)
        for (name, value) in values {
            guard let ws = byName[name], let first = ws.first else { throw PdfFormsError.unknownField(name) }
            if first.widgetFieldType == .choice, let s = value as? String, !(first.choices ?? []).contains(s) {
                throw PdfFormsError.invalidValue("\(s) is not an option of \(name)")
            }
        }
        for (name, value) in values {
            for a in byName[name] ?? [] {
                switch (a.widgetFieldType, value) {
                case (.button, let on as Bool): a.buttonWidgetState = on ? .onState : .offState
                case (_, let s as String): a.widgetStringValue = s
                default: throw PdfFormsError.invalidValue("\(value) for \(name)")
                }
            }
        }
        guard let out = doc.dataRepresentation() else { throw PdfFormsError.unreadable }
        return out
    }
}
#else
public enum PdfForms {
    public static func listFields(_ data: Data) throws -> [FormField] { throw PdfFormsError.unsupportedPlatform }
    public static func fill(_ data: Data, values: [String: Any]) throws -> Data { throw PdfFormsError.unsupportedPlatform }
}
#endif
