// SPDX-License-Identifier: Apache-2.0
// A logic-less Mustache subset over JSON-like data (JsonPatch.Value, the wave 8 JSON model; needs JsonPatch.swift):
// {{path}} HTML-escaped (& < > " '), {{{path}}} raw, {{#path}}..{{/path}} sections (lists iterate with "." as the item,
// looking names up in the item first and then the outer scopes; other truthy values render once and objects push a
// scope), {{^path}}..{{/path}} inverted sections and {{! comment }}. Paths use names and [n] indexes. Values: null "",
// booleans "true"/"false", whole numbers without ".0" (exact digits), other numbers in Swift's shortest round-trip
// form, strings as is; arrays and objects are an error. No partials, custom delimiters or lambdas.

public enum TemplateRenderError: Error, Equatable {
    case invalidTemplate(String)
    case unrenderable(String)
}

public enum TemplateRender {
    private indirect enum Node {
        case text(String)
        case variable(String, raw: Bool)
        case section(String, inverted: Bool, body: [Node])
    }

    private static func text(_ cps: ArraySlice<UInt32>) -> String {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    // Python str.isspace() code points (the reference's \s).
    private static func isSpace(_ c: UInt32) -> Bool {
        switch c {
        case 9...13, 0x1C...0x20, 0x85, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000: return true
        default: return false
        }
    }

    private static func isLetter(_ c: UInt32) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) || c == 0x5F }
    private static func isDigit(_ c: UInt32) -> Bool { (0x30...0x39).contains(c) }
    private static func isNameChar(_ c: UInt32) -> Bool { isLetter(c) || isDigit(c) || c == 0x2D }

    /// Name grammar: "." | ident ("." ident | "[" index "]")*.
    private static func validName(_ n: [UInt32]) -> Bool {
        if n == [0x2E] { return true }
        var i = 0
        func ident() -> Bool {
            guard i < n.count, isLetter(n[i]) else { return false }
            i += 1
            while i < n.count && isNameChar(n[i]) { i += 1 }
            return true
        }
        guard ident() else { return false }
        while i < n.count {
            if n[i] == 0x2E {
                i += 1
                guard ident() else { return false }
            } else if n[i] == 0x5B {
                let s = i + 1
                var j = s
                while j < n.count && isDigit(n[j]) { j += 1 }
                guard j > s, j < n.count, n[j] == 0x5D, j - s == 1 || n[s] != 0x30 else { return false }
                i = j + 1
            } else {
                return false
            }
        }
        return true
    }

    private enum Part { case key(String), index(Int) }

    private static func parts(_ name: String) -> [Part] {
        let n = name.unicodeScalars.map(\.value)
        var out: [Part] = [], i = 0
        while i < n.count {
            if n[i] == 0x5B {
                var j = i + 1
                while n[j] != 0x5D { j += 1 }
                out.append(.index(Int(text(n[(i + 1)..<j])) ?? Int.max))
                i = j + 1
            } else if n[i] == 0x2E {
                i += 1
            } else {
                var j = i
                while j < n.count && isNameChar(n[j]) { j += 1 }
                out.append(.key(text(n[i..<j])))
                i = j
            }
        }
        return out
    }

    private static func lookup(_ stack: [JsonPatch.Value], _ path: String) -> JsonPatch.Value {
        if path == "." { return stack.last! }
        let ps = parts(path)
        guard case .key(let first) = ps[0] else { return .null }
        for scope in stack.reversed() {
            guard case .object(let o) = scope, var cur = o[first] else { continue }
            for p in ps.dropFirst() {
                switch (p, cur) {
                case let (.index(i), .array(a)): cur = i < a.count ? a[i] : .null
                case let (.key(k), .object(m)): cur = m[k] ?? .null
                default: cur = .null
                }
                if case .null = cur { return .null }
            }
            return cur
        }
        return .null
    }

    private static func escapeHtml(_ s: String) -> String {
        var out = ""
        for ch in s.unicodeScalars {
            switch ch {
            case "&": out += "&amp;"
            case "<": out += "&lt;"
            case ">": out += "&gt;"
            case "\"": out += "&quot;"
            case "'": out += "&#39;"
            default: out.unicodeScalars.append(ch)
            }
        }
        return out
    }

    private static func formatNumber(_ d: Double) -> String {
        guard d.isFinite, d == d.rounded(.towardZero) else { return d.description }
        if abs(d) < 9.0e18 { return String(Int64(d)) }
        var digits: [UInt32] = [0] // exact decimal digits of significand * 2^exponent, base 1e9 little endian
        func mulAdd(_ mul: UInt64, _ add: UInt64) {
            var carry = add
            for i in digits.indices {
                let v = UInt64(digits[i]) * mul + carry
                digits[i] = UInt32(v % 1_000_000_000); carry = v / 1_000_000_000
            }
            while carry > 0 { digits.append(UInt32(carry % 1_000_000_000)); carry /= 1_000_000_000 }
        }
        mulAdd(1, abs(d).significandBitPattern | (1 << 52))
        for _ in 0..<(Int(abs(d).exponent) - 52) { mulAdd(2, 0) }
        var s = d < 0 ? "-" : ""
        s += String(digits.last!)
        for limb in digits.dropLast().reversed() {
            let part = String(limb)
            s += String(repeating: "0", count: 9 - part.count) + part
        }
        return s
    }

    private static func str(_ v: JsonPatch.Value) throws -> String {
        switch v {
        case .null: return ""
        case .bool(let b): return b ? "true" : "false"
        case .number(let d): return formatNumber(d)
        case .string(let s): return s
        case .array, .object: throw TemplateRenderError.unrenderable("cannot render a list or object")
        }
    }

    private static func truthy(_ v: JsonPatch.Value) -> Bool {
        switch v {
        case .null: return false
        case .bool(let b): return b
        case .number(let d): return d != 0
        case .string(let s): return !s.isEmpty
        case .array(let a): return !a.isEmpty
        case .object(let o): return !o.isEmpty
        }
    }

    private struct Tag {
        var start: Int, end: Int, triple: Bool, close: Bool, sigil: UInt32?, name: [UInt32]
    }

    // One tag as the reference regex \{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\} matches it.
    private static func nextTag(_ t: [UInt32], from: Int) -> Tag? {
        var s = from
        while s + 1 < t.count {
            defer { s += 1 }
            guard t[s] == 0x7B, t[s + 1] == 0x7B else { continue }
            var a = s + 2
            let triple = a < t.count && t[a] == 0x7B
            if triple { a += 1 }
            var j = a
            while j + 1 < t.count && !(t[j] == 0x7D && t[j + 1] == 0x7D) { j += 1 }
            if j + 1 >= t.count { return nil } // no "}}" after this "{{", so no later tag can match either
            var p = a
            while p < j && isSpace(t[p]) { p += 1 }
            var sigil: UInt32?
            if p < j && [0x23, 0x5E, 0x2F, 0x21].contains(t[p]) {
                sigil = t[p]; p += 1
                while p < j && isSpace(t[p]) { p += 1 }
            }
            var q = j
            while q > p && isSpace(t[q - 1]) { q -= 1 }
            let close = j + 2 < t.count && t[j + 2] == 0x7D
            return Tag(start: s, end: close ? j + 3 : j + 2, triple: triple, close: close, sigil: sigil, name: Array(t[p..<q]))
        }
        return nil
    }

    private final class Frame {
        let name: [UInt32], inverted: Bool
        var nodes: [Node] = []
        init(_ name: [UInt32], _ inverted: Bool) { self.name = name; self.inverted = inverted }
    }

    private static func parse(_ template: String) throws -> [Node] {
        let t = template.unicodeScalars.map(\.value)
        var stack = [Frame([], false)]
        var pos = 0
        while let m = nextTag(t, from: pos) {
            if m.start > pos { stack.last!.nodes.append(.text(text(t[pos..<m.start]))) }
            pos = m.end
            if m.sigil == 0x21 { continue }
            if m.triple != m.close || (m.triple && m.sigil != nil) { throw TemplateRenderError.invalidTemplate("bad triple-brace tag") }
            guard validName(m.name) else { throw TemplateRenderError.invalidTemplate("bad tag name '\(text(m.name[...]))'") }
            switch m.sigil {
            case 0x23, 0x5E: stack.append(Frame(m.name, m.sigil == 0x5E))
            case 0x2F:
                guard stack.count > 1, stack.last!.name == m.name else { throw TemplateRenderError.invalidTemplate("mismatched close tag") }
                let f = stack.removeLast()
                stack.last!.nodes.append(.section(text(f.name[...]), inverted: f.inverted, body: f.nodes))
            default: stack.last!.nodes.append(.variable(text(m.name[...]), raw: m.triple))
            }
        }
        let rest = Array(t[pos...])
        if zip(rest, rest.dropFirst()).contains(where: { $0 == 0x7B && $1 == 0x7B }) { throw TemplateRenderError.invalidTemplate("unclosed tag") }
        if !rest.isEmpty { stack.last!.nodes.append(.text(text(rest[...]))) }
        if stack.count > 1 { throw TemplateRenderError.invalidTemplate("unclosed section") }
        return stack[0].nodes
    }

    private static func run(_ nodes: [Node], _ stack: [JsonPatch.Value], _ escape: Bool, _ out: inout String) throws {
        for n in nodes {
            switch n {
            case .text(let s): out += s
            case let .variable(name, raw):
                let s = try str(lookup(stack, name))
                out += escape && !raw ? escapeHtml(s) : s
            case let .section(name, inverted, body):
                let v = lookup(stack, name)
                if inverted {
                    if !truthy(v) { try run(body, stack, escape, &out) }
                } else if case .array(let items) = v {
                    for item in items { try run(body, stack + [item], escape, &out) }
                } else if truthy(v) {
                    if case .object = v { try run(body, stack + [v], escape, &out) } else { try run(body, stack, escape, &out) }
                }
            }
        }
    }

    /// Renders template against data; with escape false, {{path}} is not HTML-escaped either.
    public static func render(_ template: String, _ data: JsonPatch.Value, escape: Bool = true) throws -> String {
        var out = ""
        try run(try parse(template), [data], escape, &out)
        return out
    }
}
