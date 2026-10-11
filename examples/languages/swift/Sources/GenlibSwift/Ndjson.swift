// SPDX-License-Identifier: Apache-2.0
// Newline-delimited JSON (this file needs JsonPatch.swift). parse splits on "\n" (dropping a trailing "\r"), skips lines
// that are empty or only spaces/tabs and parses each other line with the strict JsonPatch parser into JsonPatch.Value;
// a bad line throws NdjsonError.invalidLine with its 1-based line number. JsonPatch.Value objects are unordered Swift
// dictionaries, so stringify takes Ndjson.Value, whose objects keep insertion order; it writes each value compactly,
// escaping only ", \ and U+0000..U+001F (\b \f \n \r \t or lowercase \u00xx), keeping other text as raw UTF-8, and
// ends every value with "\n". Ndjson.Value(JsonPatch.Value) converts parsed values, ordering keys by code point.

public enum NdjsonError: Error, Equatable {
    case invalidLine(Int)
    case unsupportedValue(String)
}

public enum Ndjson {
    /// A JSON value whose object members keep insertion order (for stringify).
    public indirect enum Value {
        case null
        case bool(Bool)
        case int(Int64)
        case number(Double)
        case string(String)
        case array([Value])
        case object([(String, Value)])

        /// Converts a parsed JsonPatch.Value; whole numbers become .int and object keys are sorted by code point.
        public init(_ value: JsonPatch.Value) {
            switch value {
            case .null: self = .null
            case .bool(let b): self = .bool(b)
            case .number(let d): self = d == d.rounded(.towardZero) && abs(d) < 9.0e18 ? .int(Int64(d)) : .number(d)
            case .string(let s): self = .string(s)
            case .array(let items): self = .array(items.map(Value.init))
            case .object(let members):
                let keys = members.keys.sorted { $0.unicodeScalars.lexicographicallyPrecedes($1.unicodeScalars) }
                self = .object(keys.map { ($0, Value(members[$0]!)) })
            }
        }
    }

    /// Parses NDJSON text into the list of values.
    public static func parse(_ text: String) throws -> [JsonPatch.Value] {
        var out: [JsonPatch.Value] = []
        let lines = Array(text.unicodeScalars).split(separator: "\n", omittingEmptySubsequences: false)
        for (index, raw) in lines.enumerated() {
            var line = raw[...]
            if line.last == "\r" { line = line.dropLast() }
            if line.allSatisfy({ $0 == " " || $0 == "\t" }) { continue }
            var view = String.UnicodeScalarView()
            view.append(contentsOf: line)
            do { out.append(try JsonPatch.parse(String(view))) } catch { throw NdjsonError.invalidLine(index + 1) }
        }
        return out
    }

    private static let hex = Array("0123456789abcdef".unicodeScalars)

    private static func write(_ value: Value, _ out: inout String.UnicodeScalarView) throws {
        switch value {
        case .null: out.append(contentsOf: "null".unicodeScalars)
        case .bool(let b): out.append(contentsOf: (b ? "true" : "false").unicodeScalars)
        case .int(let i): out.append(contentsOf: String(i).unicodeScalars)
        case .number(let d):
            guard d.isFinite else { throw NdjsonError.unsupportedValue("non-finite number") }
            out.append(contentsOf: d.description.unicodeScalars)
        case .string(let s):
            out.append("\"")
            for c in s.unicodeScalars {
                switch c {
                case "\"": out.append(contentsOf: "\\\"".unicodeScalars)
                case "\\": out.append(contentsOf: "\\\\".unicodeScalars)
                case "\u{08}": out.append(contentsOf: "\\b".unicodeScalars)
                case "\u{0C}": out.append(contentsOf: "\\f".unicodeScalars)
                case "\n": out.append(contentsOf: "\\n".unicodeScalars)
                case "\r": out.append(contentsOf: "\\r".unicodeScalars)
                case "\t": out.append(contentsOf: "\\t".unicodeScalars)
                default:
                    if c.value < 0x20 {
                        out.append(contentsOf: "\\u00".unicodeScalars)
                        out.append(hex[Int(c.value >> 4)])
                        out.append(hex[Int(c.value & 15)])
                    } else {
                        out.append(c)
                    }
                }
            }
            out.append("\"")
        case .array(let items):
            out.append("[")
            for (i, item) in items.enumerated() {
                if i > 0 { out.append(",") }
                try write(item, &out)
            }
            out.append("]")
        case .object(let members):
            out.append("{")
            for (i, (key, item)) in members.enumerated() {
                if i > 0 { out.append(",") }
                try write(.string(key), &out)
                out.append(":")
                try write(item, &out)
            }
            out.append("}")
        }
    }

    /// Serializes values as NDJSON: one compact JSON value per line, each followed by "\n".
    public static func stringify(_ values: [Value]) throws -> String {
        var out = String.UnicodeScalarView()
        for v in values {
            try write(v, &out)
            out.append("\n")
        }
        return String(out)
    }
}
