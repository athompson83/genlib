// SPDX-License-Identifier: Apache-2.0
// Server-side form validation returning ordered error codes per field.

public enum FieldType: String, Sendable { case string, number, integer, boolean, email, date }

/// A submitted value. Numeric strings are `.string`, never numbers.
public enum FormValue: Equatable, Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
    ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral, ExpressibleByNilLiteral {
    case string(String), number(Double), bool(Bool), null
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .number(Double(value)) }
    public init(floatLiteral value: Double) { self = .number(value) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(nilLiteral: ()) { self = .null }
}

public struct FormField: Sendable {
    public var name: String
    public var type: FieldType
    public var required: Bool
    public var minLength: Int?, maxLength: Int?
    public var min: Double?, max: Double?
    public var pattern: String?
    public var allowed: [String]? // the spec's `enum`

    public init(_ name: String, _ type: FieldType, required: Bool = false, minLength: Int? = nil, maxLength: Int? = nil,
                min: Double? = nil, max: Double? = nil, pattern: String? = nil, allowed: [String]? = nil) {
        self.name = name; self.type = type; self.required = required; self.minLength = minLength; self.maxLength = maxLength
        self.min = min; self.max = max; self.pattern = pattern; self.allowed = allowed
    }
}

public enum FormSchemaError: Error, Equatable {
    case duplicateField(String)
    case duplicateValue(String)
    case invalidPattern(String)
}

public enum FormSchema {
    /// Validates ordered `values` against the ordered `schema`; returns (field, codes) pairs only for fields with errors.
    /// Missing, null and empty-string values of optional fields are treated as absent.
    public static func validate(_ schema: [FormField], _ values: KeyValuePairs<String, FormValue>,
                                allowUnknown: Bool = false) throws -> [(field: String, codes: [String])] {
        var input: [String: FormValue] = [:]
        for (key, value) in values {
            guard input.updateValue(value, forKey: key) == nil else { throw FormSchemaError.duplicateValue(key) }
        }
        var names = Set<String>()
        var result: [(field: String, codes: [String])] = []
        for field in schema {
            guard names.insert(field.name).inserted else { throw FormSchemaError.duplicateField(field.name) }
            let codes = try check(field, input[field.name] ?? .null)
            if !codes.isEmpty { result.append((field.name, codes)) }
        }
        if !allowUnknown {
            for (key, _) in values where !names.contains(key) { result.append((key, ["unknown"])) }
        }
        return result
    }

    private static func check(_ f: FormField, _ value: FormValue) throws -> [String] {
        if value == .null || value == .string("") { return f.required ? ["required"] : [] }
        var codes: [String] = []
        switch (f.type, value) {
        case (.boolean, .bool):
            break
        case (.number, .number(let n)) where n.isFinite, (.integer, .number(let n)) where n.isFinite && n.rounded(.towardZero) == n:
            if let lo = f.min, n < lo { codes.append("min") }
            if let hi = f.max, n > hi { codes.append("max") }
        case (.string, .string(let s)), (.email, .string(let s)), (.date, .string(let s)):
            let length = s.unicodeScalars.count
            if let min = f.minLength, length < min { codes.append("minLength") }
            if let max = f.maxLength, length > max { codes.append("maxLength") }
            if let pattern = f.pattern {
                let regex: Regex<AnyRegexOutput>
                do { regex = try Regex("(?:\(pattern))") } catch { throw FormSchemaError.invalidPattern(pattern) }
                if (try? regex.matchingSemantics(.unicodeScalar).wholeMatch(in: s)) == nil { codes.append("pattern") }
            }
            if let allowed = f.allowed, !allowed.contains(s) { codes.append("enum") }
            if f.type == .email && !isEmail(s) { codes.append("email") }
            if f.type == .date && !isDate(s) { codes.append("date") }
        default:
            return ["type"]
        }
        return codes
    }

    private static func isEmail(_ s: String) -> Bool {
        guard s.unicodeScalars.count <= 254, !s.unicodeScalars.contains(where: { $0.properties.isWhitespace }) else { return false }
        let parts = s.split(separator: "@", omittingEmptySubsequences: false)
        return parts.count == 2 && !parts[0].isEmpty && parts[1].contains(".")
    }

    private static func isDate(_ s: String) -> Bool {
        let b = Array(s.utf8)
        guard b.count == 10, b[4] == 45, b[7] == 45 else { return false }
        for (i, c) in b.enumerated() where i != 4 && i != 7 { if c < 48 || c > 57 { return false } }
        func number(_ r: Range<Int>) -> Int { b[r].reduce(0) { $0 * 10 + Int($1 - 48) } }
        let year = number(0..<4), month = number(5..<7), day = number(8..<10)
        guard (1...12).contains(month), day >= 1 else { return false }
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return day <= days[month - 1]
    }
}
