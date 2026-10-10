// SPDX-License-Identifier: Apache-2.0
// Open-redirect guard: returns a same-site path ("/x" but not "//x") or an absolute http(s) URL whose origin exactly
// matches an allowed origin, otherwise the fallback. Hand-parsed; userinfo, backslashes and control characters fail.

public enum SafeRedirect {
    public static let maxLength = 2048

    private static func lower(_ c: UInt8) -> UInt8 { (0x41...0x5A).contains(c) ? c + 32 : c }

    /// Normalized origin ("scheme://host[:port]", default ports dropped) of an absolute http(s) URL, or nil.
    static func origin(_ url: String) -> String? {
        let b = Array(url.utf8)
        var i = 0
        while i < b.count, (0x41...0x5A).contains(b[i]) || (0x61...0x7A).contains(b[i]) { i += 1 }
        let scheme = String(decoding: b[..<i].map(lower), as: UTF8.self)
        guard scheme == "http" || scheme == "https", b[i...].starts(with: "://".utf8) else { return nil }
        i += 3
        let hostStart = i
        while i < b.count, (0x30...0x39).contains(b[i]) || (0x41...0x5A).contains(b[i]) || (0x61...0x7A).contains(b[i])
            || b[i] == 0x2E || b[i] == 0x2D { i += 1 }
        let host = String(decoding: b[hostStart..<i].map(lower), as: UTF8.self)
        guard !host.isEmpty, !host.hasPrefix("."), !host.hasSuffix("."), !host.contains("..") else { return nil }
        var port: Int? = nil
        if i < b.count, b[i] == 0x3A {
            i += 1
            let portStart = i
            while i < b.count, (0x30...0x39).contains(b[i]) { i += 1 }
            guard (1...5).contains(i - portStart), let p = Int(String(decoding: b[portStart..<i], as: UTF8.self)),
                  (1...65535).contains(p) else { return nil }
            port = p
        }
        guard i == b.count || [0x2F, 0x3F, 0x23].contains(b[i]) else { return nil }
        if let p = port, (scheme == "https" && p == 443) || (scheme == "http" && p == 80) { port = nil }
        return "\(scheme)://\(host)" + (port.map { ":\($0)" } ?? "")
    }

    /// `target` when it is a safe redirect for `allowedOrigins`, otherwise `fallback`.
    public static func safeRedirect(_ target: String, allowedOrigins: [String], fallback: String = "/") -> String {
        let scalars = target.unicodeScalars
        guard !scalars.isEmpty, scalars.count <= maxLength,
              !scalars.contains(where: { $0.value <= 0x20 || $0.value == 0x7F || $0 == "\\" }) else { return fallback }
        if target.hasPrefix("/") { return target.hasPrefix("//") ? fallback : target }
        guard let o = origin(target), allowedOrigins.compactMap(origin).contains(o) else { return fallback }
        return target
    }
}
