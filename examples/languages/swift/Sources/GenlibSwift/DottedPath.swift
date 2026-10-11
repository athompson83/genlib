// SPDX-License-Identifier: Apache-2.0
// Dotted paths into JSON-like data (JsonPatch.Value, the wave 8 JSON model; this file needs JsonPatch.swift), e.g.
// user.addresses[0].city or a["x.y"]. Grammar: names separated by ".", running until "." or "[" (never empty); [n] is a
// list index (no leading zeros except 0); ["..."] is a key with \" and \\ escapes; "" is the root. get/has treat a
// missing key, an out-of-range index or a step into the wrong type as missing; JSON null and a missing value are both
// replaced when set creates containers. set and delete return new values (value semantics; inputs never change).

public enum DottedPathError: Error, Equatable {
    case invalidPath(String)
    case invalidSet(String)
}

public enum DottedPath {
    /// One path step: an object key or a list index.
    public enum Segment: Equatable {
        case key(String)
        case index(Int)
    }

    private static func text(_ cps: ArraySlice<UInt32>) -> String {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    /// Parses a path into keys and list indexes; "" is the root (no segments).
    public static func parse(_ path: String) throws -> [Segment] {
        let p = path.unicodeScalars.map(\.value)
        let n = p.count
        var out: [Segment] = [], i = 0
        while i < n {
            let c = p[i]
            if c == 0x5B { // [
                if i + 1 < n && p[i + 1] == 0x22 {
                    var j = i + 2
                    var buf: [UInt32] = []
                    while true {
                        if j >= n { throw DottedPathError.invalidPath("unterminated quoted key") }
                        if p[j] == 0x5C && j + 1 < n { buf.append(p[j + 1]); j += 2; continue }
                        if p[j] == 0x22 { break }
                        buf.append(p[j]); j += 1
                    }
                    if j + 1 >= n || p[j + 1] != 0x5D { throw DottedPathError.invalidPath("expected ]") }
                    out.append(.key(text(buf[...])))
                    i = j + 2
                } else {
                    var j = i + 1
                    while j < n && (0x30...0x39).contains(p[j]) { j += 1 }
                    let digits = p[(i + 1)..<j]
                    guard !digits.isEmpty, j < n, p[j] == 0x5D, digits.count == 1 || digits.first != 0x30 else {
                        throw DottedPathError.invalidPath("bad index")
                    }
                    // Indexes beyond Int can never be in range; saturate so get/has miss and set fails.
                    out.append(.index(Int(text(digits)) ?? Int.max))
                    i = j + 1
                }
                var needName = false
                if i < n && p[i] == 0x2E { i += 1; needName = true }
                if needName && i >= n { throw DottedPathError.invalidPath("trailing dot") }
                continue
            }
            if c == 0x2E { throw DottedPathError.invalidPath("empty segment") }
            var j = i
            while j < n && p[j] != 0x2E && p[j] != 0x5B { j += 1 }
            out.append(.key(text(p[i..<j])))
            i = j
            if i < n && p[i] == 0x2E {
                i += 1
                if i >= n { throw DottedPathError.invalidPath("trailing dot") }
            }
        }
        return out
    }

    private static func step(_ cur: JsonPatch.Value, _ k: Segment) -> JsonPatch.Value? {
        switch (k, cur) {
        case let (.index(i), .array(a)): return i < a.count ? a[i] : nil
        case let (.key(key), .object(o)): return o[key]
        default: return nil
        }
    }

    /// Returns the value at path, or defaultValue when any step is missing.
    public static func get(_ data: JsonPatch.Value, _ path: String, default defaultValue: JsonPatch.Value = .null) throws -> JsonPatch.Value {
        var cur = data
        for k in try parse(path) {
            guard let next = step(cur, k) else { return defaultValue }
            cur = next
        }
        return cur
    }

    /// Reports whether every step of path exists (a present null counts as existing).
    public static func has(_ data: JsonPatch.Value, _ path: String) throws -> Bool {
        var cur = data
        for k in try parse(path) {
            guard let next = step(cur, k) else { return false }
            cur = next
        }
        return true
    }

    private static func setIn(_ cur: JsonPatch.Value?, _ keys: ArraySlice<Segment>, _ value: JsonPatch.Value) throws -> JsonPatch.Value {
        guard let k = keys.first else { return value }
        var cur = cur ?? .null
        if case .null = cur {
            if case .index = k { cur = .array([]) } else { cur = .object([:]) }
        }
        switch (k, cur) {
        case (.index(let i), .array(var a)):
            guard i <= a.count else { throw DottedPathError.invalidSet("index out of range") }
            let v = try setIn(i < a.count ? a[i] : nil, keys.dropFirst(), value)
            if i == a.count { a.append(v) } else { a[i] = v }
            return .array(a)
        case (.index, _):
            throw DottedPathError.invalidSet("index on a non-list")
        case (.key(let key), .object(var o)):
            o[key] = try setIn(o[key], keys.dropFirst(), value)
            return .object(o)
        case (.key, _):
            throw DottedPathError.invalidSet("key on a non-object")
        }
    }

    /// Returns a new value with value at path, creating objects/lists; index == count appends.
    public static func set(_ data: JsonPatch.Value, _ path: String, _ value: JsonPatch.Value) throws -> JsonPatch.Value {
        try setIn(data, try parse(path)[...], value)
    }

    private static func deleteIn(_ cur: JsonPatch.Value, _ keys: ArraySlice<Segment>) -> JsonPatch.Value {
        let k = keys.first!
        guard let child = step(cur, k) else { return cur }
        let rest = keys.dropFirst()
        switch (k, cur) {
        case (.index(let i), .array(var a)):
            if rest.isEmpty { a.remove(at: i) } else { a[i] = deleteIn(child, rest) }
            return .array(a)
        case (.key(let key), .object(var o)):
            if rest.isEmpty { o.removeValue(forKey: key) } else { o[key] = deleteIn(child, rest) }
            return .object(o)
        default:
            return cur
        }
    }

    /// Returns a new value without the key/index at path (lists shift); a missing path returns the input unchanged.
    public static func delete(_ data: JsonPatch.Value, _ path: String) throws -> JsonPatch.Value {
        let keys = try parse(path)
        if keys.isEmpty { return .null }
        return deleteIn(data, keys[...])
    }
}
