// SPDX-License-Identifier: Apache-2.0
// RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 JSON Merge Patch, a deterministic patch generator and canonical
// JSON output, without Foundation. Values are JsonPatch.Value (distinct from StructuredData's JSONValue): numbers are
// Double, so integers beyond 2^53 lose precision; numbers compare numerically (1 == 1.0) and never equal booleans.
// Non-integer numbers print in Swift's shortest round-trip form. Object members are a Swift Dictionary, so member order
// is ignored and canonically equivalent keys (e.g. "é" precomposed vs. decomposed) count as one key; string values
// compare exactly by Unicode scalars. Every operation returns a new value; inputs are never modified (value semantics).
// parse(_:) is a strict RFC 8259 parser (duplicate keys: the last wins; nesting deeper than 512 levels is rejected).

public enum JsonPatchError: Error, Equatable {
    case invalidJSON(String)
    case invalidPointer(String)
    case invalidPatch(String)
    case testFailed(String)
}

extension JsonPatch {
    /// A JSON value (null, bool, number, string, array, object).
    public indirect enum Value: CustomStringConvertible {
        case null
        case bool(Bool)
        case number(Double)
        case string(String)
        case array([JsonPatch.Value])
        case object([String: JsonPatch.Value])

        public var description: String { JsonPatch.canonical(self) }
    }
}

extension JsonPatch.Value: Equatable {
    /// Deep equality: numbers numerically, strings by Unicode scalars, object member order ignored.
    public static func == (lhs: JsonPatch.Value, rhs: JsonPatch.Value) -> Bool {
        switch (lhs, rhs) {
        case (.null, .null): return true
        case let (.bool(a), .bool(b)): return a == b
        case let (.number(a), .number(b)): return a == b
        case let (.string(a), .string(b)): return a.unicodeScalars.elementsEqual(b.unicodeScalars)
        case let (.array(a), .array(b)): return a.count == b.count && zip(a, b).allSatisfy { $0 == $1 }
        case let (.object(a), .object(b)):
            return a.count == b.count && a.allSatisfy { k, v in b[k].map { $0 == v } ?? false }
        default: return false
        }
    }
}

public enum JsonPatch {
    // MARK: Canonical output

    /// Compact JSON with object keys in code point order; whole numbers print without a decimal point.
    public static func canonical(_ value: JsonPatch.Value) -> String {
        var out = ""
        write(value, &out)
        return out
    }

    private static func write(_ value: JsonPatch.Value, _ out: inout String) {
        switch value {
        case .null: out += "null"
        case .bool(let b): out += b ? "true" : "false"
        case .number(let d): out += formatNumber(d)
        case .string(let s): writeString(s, &out)
        case .array(let items):
            out += "["
            for (i, item) in items.enumerated() {
                if i > 0 { out += "," }
                write(item, &out)
            }
            out += "]"
        case .object(let members):
            out += "{"
            for (i, key) in sortedKeys(members.keys).enumerated() {
                if i > 0 { out += "," }
                writeString(key, &out)
                out += ":"
                write(members[key]!, &out)
            }
            out += "}"
        }
    }

    private static func sortedKeys<S: Sequence>(_ keys: S) -> [String] where S.Element == String {
        keys.sorted { $0.unicodeScalars.lexicographicallyPrecedes($1.unicodeScalars) }
    }

    private static func writeString(_ s: String, _ out: inout String) {
        let hex: [Character] = Array("0123456789abcdef")
        out += "\""
        for scalar in s.unicodeScalars {
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    out += "\\u00"
                    out.append(hex[Int(scalar.value >> 4)])
                    out.append(hex[Int(scalar.value & 15)])
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
    }

    private static func formatNumber(_ d: Double) -> String {
        guard d.isFinite else { return d.description }
        if d != d.rounded(.towardZero) { return d.description }
        if abs(d) < 9.0e18 { return String(Int64(d)) }
        // A whole number beyond Int64: exact decimal digits of significand * 2^exponent.
        var digits: [UInt32] = [0]  // base 1e9, little endian
        func mulAdd(_ mul: UInt64, _ add: UInt64) {
            var carry = add
            for i in digits.indices {
                let v = UInt64(digits[i]) * mul + carry
                digits[i] = UInt32(v % 1_000_000_000); carry = v / 1_000_000_000
            }
            while carry > 0 { digits.append(UInt32(carry % 1_000_000_000)); carry /= 1_000_000_000 }
        }
        let sig = abs(d).significandBitPattern | (1 << 52)
        mulAdd(1, sig)
        for _ in 0..<(Int(abs(d).exponent) - 52) { mulAdd(2, 0) }
        var s = d < 0 ? "-" : ""
        s += String(digits.last!)
        for limb in digits.dropLast().reversed() {
            let part = String(limb)
            s += String(repeating: "0", count: 9 - part.count) + part
        }
        return s
    }

    // MARK: Strict RFC 8259 parser

    /// Parses JSON text strictly (no trailing commas, leading zeros, NaN, comments, lone surrogates or trailing data).
    public static func parse(_ text: String) throws -> JsonPatch.Value {
        var p = Parser(bytes: Array(text.utf8))
        p.skipSpace()
        let value = try p.value(depth: 0)
        p.skipSpace()
        guard p.i == p.bytes.count else { throw p.fail("trailing data") }
        return value
    }

    private struct Parser {
        let bytes: [UInt8]
        var i = 0

        init(bytes: [UInt8]) { self.bytes = bytes }

        func fail(_ message: String) -> JsonPatchError { .invalidJSON("\(message) at byte \(i)") }

        mutating func skipSpace() {
            while i < bytes.count, [0x20, 0x09, 0x0A, 0x0D].contains(bytes[i]) { i += 1 }
        }

        mutating func literal(_ word: String, _ value: JsonPatch.Value) throws -> JsonPatch.Value {
            let w = Array(word.utf8)
            guard i + w.count <= bytes.count, Array(bytes[i..<(i + w.count)]) == w else { throw fail("invalid literal") }
            i += w.count
            return value
        }

        mutating func value(depth: Int) throws -> JsonPatch.Value {
            guard depth < 512 else { throw fail("nesting too deep") }
            guard i < bytes.count else { throw fail("unexpected end") }
            switch bytes[i] {
            case 0x7B: // {
                i += 1; skipSpace()
                var members: [String: JsonPatch.Value] = [:]
                if i < bytes.count && bytes[i] == 0x7D { i += 1; return .object(members) }
                while true {
                    guard i < bytes.count, bytes[i] == 0x22 else { throw fail("expected string key") }
                    let key = try string()
                    skipSpace()
                    guard i < bytes.count, bytes[i] == 0x3A else { throw fail("expected ':'") }
                    i += 1; skipSpace()
                    members[key] = try value(depth: depth + 1)
                    skipSpace()
                    guard i < bytes.count else { throw fail("unterminated object") }
                    if bytes[i] == 0x2C { i += 1; skipSpace(); continue }
                    if bytes[i] == 0x7D { i += 1; return .object(members) }
                    throw fail("expected ',' or '}'")
                }
            case 0x5B: // [
                i += 1; skipSpace()
                var items: [JsonPatch.Value] = []
                if i < bytes.count && bytes[i] == 0x5D { i += 1; return .array(items) }
                while true {
                    items.append(try value(depth: depth + 1))
                    skipSpace()
                    guard i < bytes.count else { throw fail("unterminated array") }
                    if bytes[i] == 0x2C { i += 1; skipSpace(); continue }
                    if bytes[i] == 0x5D { i += 1; return .array(items) }
                    throw fail("expected ',' or ']'")
                }
            case 0x22: return .string(try string())
            case 0x74: return try literal("true", .bool(true))
            case 0x66: return try literal("false", .bool(false))
            case 0x6E: return try literal("null", .null)
            default: return try number()
            }
        }

        mutating func digits() -> Int {
            let start = i
            while i < bytes.count && bytes[i] >= 0x30 && bytes[i] <= 0x39 { i += 1 }
            return i - start
        }

        mutating func number() throws -> JsonPatch.Value {
            let start = i
            if i < bytes.count && bytes[i] == 0x2D { i += 1 }
            guard i < bytes.count, bytes[i] >= 0x30 && bytes[i] <= 0x39 else { throw fail("invalid value") }
            if bytes[i] == 0x30 { i += 1 } else { _ = digits() }
            if i < bytes.count && bytes[i] == 0x2E {
                i += 1
                guard digits() > 0 else { throw fail("digit expected after '.'") }
            }
            if i < bytes.count && (bytes[i] == 0x65 || bytes[i] == 0x45) {
                i += 1
                if i < bytes.count && (bytes[i] == 0x2B || bytes[i] == 0x2D) { i += 1 }
                guard digits() > 0 else { throw fail("digit expected in exponent") }
            }
            guard let d = Double(String(decoding: bytes[start..<i], as: UTF8.self)), d.isFinite else {
                throw fail("number out of range")
            }
            return .number(d)
        }

        mutating func hex4() throws -> UInt32 {
            guard i + 4 <= bytes.count else { throw fail("short \\u escape") }
            var v: UInt32 = 0
            for _ in 0..<4 {
                let c = bytes[i]
                let d: UInt32
                switch c {
                case 0x30...0x39: d = UInt32(c - 0x30)
                case 0x41...0x46: d = UInt32(c - 0x37)
                case 0x61...0x66: d = UInt32(c - 0x57)
                default: throw fail("invalid \\u escape")
                }
                v = v << 4 | d
                i += 1
            }
            return v
        }

        mutating func string() throws -> String {
            i += 1  // opening quote
            var out: [UInt8] = []
            while true {
                guard i < bytes.count else { throw fail("unterminated string") }
                let c = bytes[i]
                if c == 0x22 { i += 1; return String(decoding: out, as: UTF8.self) }
                if c < 0x20 { throw fail("unescaped control character in string") }
                if c != 0x5C { out.append(c); i += 1; continue }
                i += 1
                guard i < bytes.count else { throw fail("unterminated escape") }
                let e = bytes[i]
                i += 1
                switch e {
                case 0x22, 0x5C, 0x2F: out.append(e)
                case 0x62: out.append(0x08)
                case 0x66: out.append(0x0C)
                case 0x6E: out.append(0x0A)
                case 0x72: out.append(0x0D)
                case 0x74: out.append(0x09)
                case 0x75:
                    var v = try hex4()
                    if v >= 0xD800 && v <= 0xDBFF {
                        guard i + 1 < bytes.count, bytes[i] == 0x5C, bytes[i + 1] == 0x75 else { throw fail("lone surrogate") }
                        i += 2
                        let lo = try hex4()
                        guard lo >= 0xDC00 && lo <= 0xDFFF else { throw fail("lone surrogate") }
                        v = 0x10000 + ((v - 0xD800) << 10) + (lo - 0xDC00)
                    } else if v >= 0xDC00 && v <= 0xDFFF {
                        throw fail("lone surrogate")
                    }
                    out += Array(String(Character(Unicode.Scalar(v)!)).utf8)
                default: throw fail("invalid escape")
                }
            }
        }
    }

    // MARK: RFC 6901 JSON Pointer

    private static func parsePointer(_ pointer: String) throws -> [String] {
        if pointer.isEmpty { return [] }
        guard pointer.unicodeScalars.first == "/" else {
            throw JsonPatchError.invalidPointer("pointer must be empty or start with \"/\"")
        }
        var tokens: [String] = [], cur = String.UnicodeScalarView(), tilde = false
        for scalar in pointer.unicodeScalars.dropFirst() {
            if tilde {
                tilde = false
                switch scalar {
                case "0": cur.append("~")
                case "1": cur.append("/")
                default: throw JsonPatchError.invalidPointer("bad escape in pointer")
                }
            } else if scalar == "~" {
                tilde = true
            } else if scalar == "/" {
                tokens.append(String(cur)); cur = String.UnicodeScalarView()
            } else {
                cur.append(scalar)
            }
        }
        if tilde { throw JsonPatchError.invalidPointer("bad escape in pointer") }
        tokens.append(String(cur))
        return tokens
    }

    private static func escapeToken(_ token: String) -> String {
        var out = String.UnicodeScalarView()
        for s in token.unicodeScalars {
            if s == "~" { out.append(contentsOf: "~0".unicodeScalars) }
            else if s == "/" { out.append(contentsOf: "~1".unicodeScalars) }
            else { out.append(s) }
        }
        return String(out)
    }

    private static func index(_ token: String, _ n: Int, allowEnd: Bool) throws -> Int {
        if allowEnd && token == "-" { return n }
        let u = Array(token.utf8)
        let valid = !u.isEmpty && u.allSatisfy { $0 >= 0x30 && $0 <= 0x39 } && (u[0] != 0x30 || u.count == 1)
        guard valid else { throw JsonPatchError.invalidPointer("bad array index \(token)") }
        guard let i = Int(token), i < n || (i == n && allowEnd) else {
            throw JsonPatchError.invalidPointer("array index out of range")
        }
        return i
    }

    private static func get(_ doc: JsonPatch.Value, _ tokens: ArraySlice<String>) throws -> JsonPatch.Value {
        var cur = doc
        for t in tokens {
            switch cur {
            case .object(let o):
                guard let v = o[t] else { throw JsonPatchError.invalidPointer("no member \(t)") }
                cur = v
            case .array(let a): cur = a[try index(t, a.count, allowEnd: false)]
            default: throw JsonPatchError.invalidPointer("cannot index a scalar")
            }
        }
        return cur
    }

    /// The value at pointer (RFC 6901); "" is the whole document.
    public static func getPointer(_ doc: JsonPatch.Value, _ pointer: String) throws -> JsonPatch.Value {
        try get(doc, parsePointer(pointer)[...])
    }

    /// Calls body with the container that holds the last token (descending as get does), writing changes back.
    private static func withParent<R>(_ doc: inout JsonPatch.Value, _ tokens: ArraySlice<String>,
                                      _ body: (inout JsonPatch.Value, String) throws -> R) throws -> R {
        if tokens.count == 1 { return try body(&doc, tokens.first!) }
        let t = tokens.first!, rest = tokens.dropFirst()
        switch doc {
        case .object(var o):
            guard var child = o[t] else { throw JsonPatchError.invalidPointer("no member \(t)") }
            doc = .null; o[t] = nil  // keep storage uniquely referenced while it changes
            defer { o[t] = child; doc = .object(o) }
            return try withParent(&child, rest, body)
        case .array(var a):
            let i = try index(t, a.count, allowEnd: false)
            var child = a[i]
            doc = .null; a[i] = .null
            defer { a[i] = child; doc = .array(a) }
            return try withParent(&child, rest, body)
        default: throw JsonPatchError.invalidPointer("cannot index a scalar")
        }
    }

    private static func add(_ doc: inout JsonPatch.Value, _ tokens: [String], _ value: JsonPatch.Value) throws {
        if tokens.isEmpty { doc = value; return }
        try withParent(&doc, tokens[...]) { parent, last in
            switch parent {
            case .object(var o): parent = .null; o[last] = value; parent = .object(o)
            case .array(var a):
                let i = try index(last, a.count, allowEnd: true)
                parent = .null; a.insert(value, at: i); parent = .array(a)
            default: throw JsonPatchError.invalidPatch("cannot add to a scalar")
            }
        }
    }

    @discardableResult
    private static func remove(_ doc: inout JsonPatch.Value, _ tokens: [String]) throws -> JsonPatch.Value {
        if tokens.isEmpty { throw JsonPatchError.invalidPatch("cannot remove the root") }
        return try withParent(&doc, tokens[...]) { parent, last in
            switch parent {
            case .object(var o):
                guard o[last] != nil else { throw JsonPatchError.invalidPointer("no member \(last)") }
                parent = .null
                let v = o.removeValue(forKey: last)!
                parent = .object(o)
                return v
            case .array(var a):
                let i = try index(last, a.count, allowEnd: false)
                parent = .null
                let v = a.remove(at: i)
                parent = .array(a)
                return v
            default: throw JsonPatchError.invalidPatch("cannot remove from a scalar")
            }
        }
    }

    // MARK: RFC 6902 JSON Patch

    /// Applies an RFC 6902 patch (a JSON array of operations) atomically and returns the new document.
    public static func applyPatch(_ doc: JsonPatch.Value, _ patch: JsonPatch.Value) throws -> JsonPatch.Value {
        guard case .array(let operations) = patch else { throw JsonPatchError.invalidPatch("patch must be an array") }
        var doc = doc
        for operation in operations {
            guard case .object(let op) = operation, case .string(let kind)? = op["op"] else {
                throw JsonPatchError.invalidPatch("operation needs \"op\"")
            }
            guard let pathValue = op["path"] else { throw JsonPatchError.invalidPatch("operation needs \"path\"") }
            guard case .string(let pathText) = pathValue else { throw JsonPatchError.invalidPointer("pointer must be a string") }
            let path = try parsePointer(pathText)
            if ["add", "replace", "test"].contains(kind) && op["value"] == nil {
                throw JsonPatchError.invalidPatch("\(kind) needs \"value\"")
            }
            var from: [String] = []
            if kind == "move" || kind == "copy" {
                guard let fromValue = op["from"] else { throw JsonPatchError.invalidPatch("\(kind) needs \"from\"") }
                guard case .string(let fromText) = fromValue else { throw JsonPatchError.invalidPointer("pointer must be a string") }
                from = try parsePointer(fromText)
            }
            switch kind {
            case "add": try add(&doc, path, op["value"]!)
            case "remove": try remove(&doc, path)
            case "replace":
                _ = try get(doc, path[...])
                if path.isEmpty { doc = op["value"]! } else { try remove(&doc, path); try add(&doc, path, op["value"]!) }
            case "move":
                if from == path { _ = try get(doc, from[...]); continue }
                if path.count >= from.count && Array(path[..<from.count]) == from {
                    throw JsonPatchError.invalidPatch("cannot move a value into itself")
                }
                let value = try remove(&doc, from)
                try add(&doc, path, value)
            case "copy": try add(&doc, path, try get(doc, from[...]))
            case "test":
                guard try get(doc, path[...]) == op["value"]! else { throw JsonPatchError.testFailed("test failed at \(pathText)") }
            default: throw JsonPatchError.invalidPatch("unknown op \(kind)")
            }
        }
        return doc
    }

    // MARK: RFC 7396 merge patch

    /// Applies an RFC 7396 merge patch and returns the new value.
    public static func mergePatch(_ target: JsonPatch.Value, _ patch: JsonPatch.Value) -> JsonPatch.Value {
        guard case .object(let p) = patch else { return patch }
        var out: [String: JsonPatch.Value]
        if case .object(let t) = target { out = t } else { out = [:] }
        for (k, v) in p {
            if case .null = v { out[k] = nil } else { out[k] = mergePatch(out[k] ?? .null, v) }
        }
        return .object(out)
    }

    // MARK: Patch generation

    /// A deterministic RFC 6902 patch turning a into b: applyPatch(a, createPatch(a, b)) == b.
    public static func createPatch(_ a: JsonPatch.Value, _ b: JsonPatch.Value) -> JsonPatch.Value {
        var ops: [JsonPatch.Value] = []
        create(a, b, "", &ops)
        return .array(ops)
    }

    private static func op(_ kind: String, _ path: String, _ value: JsonPatch.Value? = nil) -> JsonPatch.Value {
        var o: [String: JsonPatch.Value] = ["op": .string(kind), "path": .string(path)]
        if let value { o["value"] = value }
        return .object(o)
    }

    private static func create(_ a: JsonPatch.Value, _ b: JsonPatch.Value, _ path: String, _ ops: inout [JsonPatch.Value]) {
        if a == b { return }
        switch (a, b) {
        case let (.object(x), .object(y)):
            for k in sortedKeys(Set(x.keys).union(y.keys)) {
                let p = path + "/" + escapeToken(k)
                if let xv = x[k] {
                    if let yv = y[k] { create(xv, yv, p, &ops) } else { ops.append(op("remove", p)) }
                } else {
                    ops.append(op("add", p, y[k]!))
                }
            }
        case let (.array(x), .array(y)):
            for i in 0..<min(x.count, y.count) { create(x[i], y[i], "\(path)/\(i)", &ops) }
            for i in stride(from: x.count - 1, through: y.count, by: -1) { ops.append(op("remove", "\(path)/\(i)")) }
            for i in stride(from: x.count, to: y.count, by: 1) { ops.append(op("add", "\(path)/\(i)", y[i])) }
        default:
            ops.append(op("replace", path, b))
        }
    }
}
