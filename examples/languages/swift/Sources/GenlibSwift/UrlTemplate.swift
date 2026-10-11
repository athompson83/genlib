// SPDX-License-Identifier: Apache-2.0
// RFC 6570 URI Template expansion, levels 1-4. Expressions are {op? varspec(,varspec)*} with operators none, + # . / ;
// ? &; a varspec is a name with an optional :prefix (1..9999, strings only, counted in Unicode scalars) or * (explode).
// Values are a string, a list of strings or an ordered list of key/value pairs; a missing name, an empty list and an
// empty map are undefined and skipped. Unreserved characters are kept; + and # (and template literals) also keep
// reserved characters and existing %XX triplets; everything else is percent-encoded as UTF-8 with uppercase hex.

public enum UrlTemplateError: Error, Equatable {
    case invalidTemplate(String)
}

public enum UrlTemplate {
    /// A template variable value: a string, a list of strings or an insertion-ordered map of strings.
    public enum Value {
        case string(String)
        case list([String])
        case map([(String, String)])
    }

    private struct Op { let first: String, sep: String, named: Bool, ifemp: String, allow: Bool }
    private static let ops: [UInt32: Op] = [
        0: Op(first: "", sep: ",", named: false, ifemp: "", allow: false),
        0x2B: Op(first: "", sep: ",", named: false, ifemp: "", allow: true),       // +
        0x23: Op(first: "#", sep: ",", named: false, ifemp: "", allow: true),      // #
        0x2E: Op(first: ".", sep: ".", named: false, ifemp: "", allow: false),     // .
        0x2F: Op(first: "/", sep: "/", named: false, ifemp: "", allow: false),     // /
        0x3B: Op(first: ";", sep: ";", named: true, ifemp: "", allow: false),      // ;
        0x3F: Op(first: "?", sep: "&", named: true, ifemp: "=", allow: false),     // ?
        0x26: Op(first: "&", sep: "&", named: true, ifemp: "=", allow: false),     // &
    ]
    private static let reserved = Set(":/?#[]@!$&'()*+,;=".unicodeScalars.map(\.value))
    private static let hexDigits = Array("0123456789ABCDEF".unicodeScalars)

    private static func fail(_ message: String) -> UrlTemplateError { .invalidTemplate(message) }
    private static func isHex(_ c: UInt32) -> Bool { (0x30...0x39).contains(c) || (0x41...0x46).contains(c) || (0x61...0x66).contains(c) }
    private static func isAlnum(_ c: UInt32) -> Bool { (0x30...0x39).contains(c) || (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }
    private static func isUnreserved(_ c: UInt32) -> Bool { isAlnum(c) || c == 0x2D || c == 0x2E || c == 0x5F || c == 0x7E }
    private static func text<C: Collection>(_ cps: C) -> String where C.Element == UInt32 {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    private static func enc(_ s: String, _ allowReserved: Bool) -> String {
        let cps = s.unicodeScalars.map(\.value)
        var out = String.UnicodeScalarView(), i = 0
        while i < cps.count {
            let c = cps[i]
            if allowReserved && c == 0x25 && i + 2 < cps.count && isHex(cps[i + 1]) && isHex(cps[i + 2]) {
                for k in 0..<3 { out.append(Unicode.Scalar(cps[i + k])!) }
                i += 3
                continue
            }
            if isUnreserved(c) || (allowReserved && reserved.contains(c)) {
                out.append(Unicode.Scalar(c)!)
            } else {
                for b in String(Unicode.Scalar(c)!).utf8 {
                    out.append("%")
                    out.append(hexDigits[Int(b >> 4)])
                    out.append(hexDigits[Int(b & 15)])
                }
            }
            i += 1
        }
        return String(out)
    }

    /// varname = varchar *( ["."] varchar ), varchar = ALPHA / DIGIT / "_" / pct-encoded.
    private static func validName(_ cps: [UInt32]) -> Bool {
        var i = 0, needChar = true
        while i < cps.count {
            let c = cps[i]
            if c == 0x2E {
                if needChar { return false }
                needChar = true
                i += 1
                continue
            }
            if isAlnum(c) || c == 0x5F {
                i += 1
            } else if c == 0x25 && i + 2 < cps.count && isHex(cps[i + 1]) && isHex(cps[i + 2]) {
                i += 3
            } else {
                return false
            }
            needChar = false
        }
        return !needChar
    }

    private static func parseVarspec(_ spec: [UInt32]) throws -> (name: String, prefix: Int?, explode: Bool) {
        var nameEnd = spec.count, prefix: Int? = nil, explode = false
        if let colon = spec.firstIndex(of: 0x3A) {
            nameEnd = colon
            let digits = spec[(colon + 1)...]
            guard !digits.isEmpty, digits.allSatisfy({ (0x30...0x39).contains($0) }) else { throw fail("bad varspec: \(text(spec))") }
            guard digits.first != 0x30, digits.count <= 4 else { throw fail("bad prefix: \(text(spec))") }
            prefix = digits.reduce(0) { $0 * 10 + Int($1 - 0x30) }
        } else if spec.last == 0x2A {
            nameEnd = spec.count - 1
            explode = true
        }
        let name = Array(spec[..<nameEnd])
        guard validName(name) else { throw fail("bad varspec: \(text(spec))") }
        return (text(name), prefix, explode)
    }

    private static func expandExpression(_ expr: [UInt32], _ variables: [String: Value]) throws -> String {
        guard let f = expr.first else { throw fail("empty expression") }
        if [0x3D, 0x2C, 0x21, 0x40, 0x7C].contains(f) { throw fail("reserved operator: \(text([f]))") }
        let opKey: UInt32 = ops[f] != nil ? f : 0
        let op = ops[opKey]!
        let body = Array(expr.dropFirst(opKey == 0 ? 0 : 1))
        var parts: [String] = []
        for spec in body.split(separator: 0x2C, omittingEmptySubsequences: false) {
            let (name, prefix, explode) = try parseVarspec(Array(spec))
            guard let value = variables[name] else { continue }
            let encName = enc(name, op.allow)
            switch value {
            case .string(let s):
                let v = prefix.map { text(s.unicodeScalars.prefix($0).map(\.value)) } ?? s
                if op.named { parts.append(encName + (v.isEmpty ? op.ifemp : "=" + enc(v, op.allow))) } else { parts.append(enc(v, op.allow)) }
            case .list(let items):
                if items.isEmpty { continue }
                if prefix != nil { throw fail("prefix on composite value: \(name)") }
                if !explode {
                    let joined = items.map { enc($0, op.allow) }.joined(separator: ",")
                    parts.append(op.named ? encName + "=" + joined : joined)
                } else if op.named {
                    parts.append(items.map { encName + ($0.isEmpty ? op.ifemp : "=" + enc($0, op.allow)) }.joined(separator: op.sep))
                } else {
                    parts.append(items.map { enc($0, op.allow) }.joined(separator: op.sep))
                }
            case .map(let pairs):
                if pairs.isEmpty { continue }
                if prefix != nil { throw fail("prefix on composite value: \(name)") }
                if !explode {
                    let joined = pairs.map { enc($0.0, op.allow) + "," + enc($0.1, op.allow) }.joined(separator: ",")
                    parts.append(op.named ? encName + "=" + joined : joined)
                } else {
                    parts.append(pairs.map { k, v in
                        enc(k, op.allow) + (op.named && v.isEmpty ? op.ifemp : "=" + enc(v, op.allow))
                    }.joined(separator: op.sep))
                }
            }
        }
        return parts.isEmpty ? "" : op.first + parts.joined(separator: op.sep)
    }

    /// Expands an RFC 6570 template with string, list or ordered-map variables.
    public static func expand(_ template: String, _ variables: [String: Value]) throws -> String {
        let cps = template.unicodeScalars.map(\.value)
        var out = "", i = 0
        while i < cps.count {
            let c = cps[i]
            if c == 0x7B {
                guard let j = cps[i...].firstIndex(of: 0x7D) else { throw fail("unclosed expression") }
                out += try expandExpression(Array(cps[(i + 1)..<j]), variables)
                i = j + 1
            } else if c == 0x7D {
                throw fail("stray }")
            } else if c == 0x25 && i + 2 < cps.count && isHex(cps[i + 1]) && isHex(cps[i + 2]) {
                // RFC 6570 section 3.1: a pct-encoded triplet in a literal is copied as-is.
                out += text(cps[i..<(i + 3)])
                i += 3
            } else {
                out += enc(text([c]), true)
                i += 1
            }
        }
        return out
    }
}
