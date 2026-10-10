// SPDX-License-Identifier: Apache-2.0
// IP addresses and CIDR ranges for an SSRF guard. Hand-parsed so every platform gives identical results.
// IPv4: exactly four decimal parts 0-255 without leading zeros. IPv6 (RFC 4291): 1-4 hex digits per group, at most one
// "::", optional embedded dotted IPv4 tail; zone ids, brackets, whitespace and CIDR suffixes are rejected.
// canonicalIp writes RFC 5952 text (IPv4-mapped addresses as ::ffff:a.b.c.d).
//
// SSRF guard usage: resolve the hostname yourself, check EVERY resolved address with isPublicIp, then connect to that
// checked address (no second DNS lookup), and repeat the check after every redirect.

public enum IpCidrError: Error, Equatable {
    case invalidArgument(String)
}

public enum IpCidr {
    private static func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }
    private static func hexValue(_ c: UInt8) -> Int? {
        switch c {
        case 0x30...0x39: return Int(c - 0x30)
        case 0x41...0x46: return Int(c - 0x41 + 10)
        case 0x61...0x66: return Int(c - 0x61 + 10)
        default: return nil
        }
    }

    /// Decimal 0|[1-9][0-9]{0,2} -> value, else nil.
    private static func smallDecimal(_ p: ArraySlice<UInt8>) -> Int? {
        guard (1...3).contains(p.count), p.allSatisfy(isDigit) else { return nil }
        if p.count > 1 && p.first == 0x30 { return nil }
        return p.reduce(0) { $0 * 10 + Int($1 - 0x30) }
    }

    private static func parseV4(_ b: ArraySlice<UInt8>) -> [UInt8]? {
        let parts = b.split(separator: 0x2E, omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var out: [UInt8] = []
        for p in parts {
            guard let v = smallDecimal(p), v <= 255 else { return nil }
            out.append(UInt8(v))
        }
        return out
    }

    private static func groups(_ x: ArraySlice<UInt8>) -> [Int]? {
        if x.isEmpty { return [] }
        var out: [Int] = []
        for h in x.split(separator: 0x3A, omittingEmptySubsequences: false) {
            guard (1...4).contains(h.count) else { return nil }
            var v = 0
            for c in h {
                guard let d = hexValue(c) else { return nil }
                v = v * 16 + d
            }
            out.append(v)
        }
        return out
    }

    private static func parseV6(_ all: [UInt8]) -> [UInt8]? {
        var doubles = 0, i = 0
        while i < all.count {
            if all[i] == 0x3A, i + 1 < all.count, all[i + 1] == 0x3A { doubles += 1; i += 2 } else { i += 1 }
        }
        guard doubles <= 1, !all.isEmpty,
              all.allSatisfy({ hexValue($0) != nil || $0 == 0x3A || $0 == 0x2E }) else { return nil }
        var s = all[...]
        var tail: [UInt8] = []
        if all.contains(0x2E) {
            guard let colon = all.lastIndex(of: 0x3A), let v4 = parseV4(all[(colon + 1)...]) else { return nil }
            tail = v4
            s = (colon >= 1 && all[colon - 1] == 0x3A) ? all[..<(colon + 1)] : all[..<colon]
        }
        let need = tail.isEmpty ? 8 : 6
        var g: [Int]
        if let at = firstDoubleColon(s) {
            guard let ga = groups(s[s.startIndex..<at]), let gb = groups(s[(at + 2)...]),
                  ga.count + gb.count <= need - 1 else { return nil }
            g = ga + Array(repeating: 0, count: need - ga.count - gb.count) + gb
        } else {
            guard let gs = groups(s), gs.count == need else { return nil }
            g = gs
        }
        var out: [UInt8] = []
        for x in g { out.append(UInt8(x >> 8)); out.append(UInt8(x & 0xFF)) }
        return out + tail
    }

    private static func firstDoubleColon(_ s: ArraySlice<UInt8>) -> Int? {
        var i = s.startIndex
        while i + 1 < s.endIndex {
            if s[i] == 0x3A && s[i + 1] == 0x3A { return i }
            i += 1
        }
        return nil
    }

    /// 4 bytes (IPv4) or 16 bytes (IPv6); throws IpCidrError for anything else.
    public static func parseIp(_ text: String) throws -> [UInt8] {
        let b = Array(text.utf8)
        let parsed = b.contains(0x3A) ? parseV6(b) : parseV4(b[...])
        guard let out = parsed else { throw IpCidrError.invalidArgument("invalid IP address: \(text.debugDescription)") }
        return out
    }

    private static let mappedPrefix: [UInt8] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xFF, 0xFF]
    private static let nat64Prefix: [UInt8] = [0, 0x64, 0xFF, 0x9B, 0, 0, 0, 0, 0, 0, 0, 0]

    private static func dotted(_ b: ArraySlice<UInt8>) -> String { b.map { String($0) }.joined(separator: ".") }

    /// RFC 5952 text for 4 or 16 address bytes.
    public static func formatIp(_ b: [UInt8]) -> String {
        if b.count == 4 { return dotted(b[...]) }
        if Array(b[..<12]) == mappedPrefix { return "::ffff:" + dotted(b[12...]) }
        let g = stride(from: 0, to: 16, by: 2).map { Int(b[$0]) << 8 | Int(b[$0 + 1]) }
        var best = -1, bestLen = 1, i = 0
        while i < 8 {
            if g[i] == 0 {
                var j = i
                while j < 8 && g[j] == 0 { j += 1 }
                if j - i > bestLen { best = i; bestLen = j - i }
                i = j
            } else { i += 1 }
        }
        let h = g.map { String($0, radix: 16) }
        if best < 0 { return h.joined(separator: ":") }
        return h[..<best].joined(separator: ":") + "::" + h[(best + bestLen)...].joined(separator: ":")
    }

    /// Canonical (RFC 5952) text of an IP address.
    public static func canonicalIp(_ text: String) throws -> String { formatIp(try parseIp(text)) }

    private static func parseCidr(_ cidr: String) throws -> ([UInt8], Int) {
        let bad = IpCidrError.invalidArgument("invalid CIDR: \(cidr.debugDescription)")
        let parts = cidr.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 2 else { throw bad }
        let base = try parseIp(String(parts[0]))
        guard let p = smallDecimal(Array(parts[1].utf8)[...]), p <= base.count * 8 else { throw bad }
        for bit in p..<(base.count * 8) where base[bit / 8] & (0x80 >> UInt8(bit % 8)) != 0 {
            throw IpCidrError.invalidArgument("CIDR has host bits set: \(cidr.debugDescription)")
        }
        return (base, p)
    }

    private static func samePrefix(_ a: [UInt8], _ b: [UInt8], _ p: Int) -> Bool {
        for bit in 0..<p {
            let m = UInt8(0x80) >> UInt8(bit % 8)
            if a[bit / 8] & m != b[bit / 8] & m { return false }
        }
        return true
    }

    /// True when `ip` lies inside `cidr` ("address/prefix"); different families never match. Throws on a malformed
    /// CIDR or address, or when the CIDR has host bits set.
    public static func cidrContains(_ cidr: String, _ ip: String) throws -> Bool {
        let (base, p) = try parseCidr(cidr)
        let x = try parseIp(ip)
        return x.count == base.count && samePrefix(base, x, p)
    }

    private static let v4Special = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
                                    "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15",
                                    "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"]
    private static let v6Special = ["::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7",
                                    "fe80::/10", "ff00::/8"]
    private static let special: [([UInt8], Int)] = (v4Special + v6Special).map { try! parseCidr($0) }

    /// False for loopback, private, link-local, shared, documentation, multicast, reserved and similar ranges.
    /// IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) addresses are judged by their embedded IPv4 address.
    public static func isPublicIp(_ ip: String) throws -> Bool {
        var b = try parseIp(ip)
        if b.count == 16 && (Array(b[..<12]) == mappedPrefix || Array(b[..<12]) == nat64Prefix) { b = Array(b[12...]) }
        return !special.contains { $0.0.count == b.count && samePrefix($0.0, b, $0.1) }
    }
}
