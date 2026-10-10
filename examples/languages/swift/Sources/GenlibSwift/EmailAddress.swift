// SPDX-License-Identifier: Apache-2.0
// WHATWG HTML "valid e-mail address" syntax (ASCII only), hand-parsed, with total length <= 254 and local part <= 64.
// This checks syntax only: `user.@example.com` and `a@b` are valid per WHATWG. Proving that someone owns an address
// still needs a confirmation email.

public enum EmailError: Error, Equatable {
    case invalidArgument(String)
}

public enum EmailAddress {
    private static let localExtra = Set(".!#$%&'*+/=?^_`{|}~-".utf8)

    private static func isAlnum(_ c: UInt8) -> Bool { (0x30...0x39).contains(c) || (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }

    private static func validLabel(_ l: ArraySlice<UInt8>) -> Bool {
        guard let first = l.first, let last = l.last, l.count <= 63, isAlnum(first), isAlnum(last) else { return false }
        return l.allSatisfy { isAlnum($0) || $0 == 0x2D }
    }

    /// True when `s` is a syntactically valid e-mail address.
    public static func emailValid(_ s: String) -> Bool {
        let b = Array(s.utf8)
        guard b.count <= 254, let at = b.firstIndex(of: 0x40) else { return false }
        let local = b[..<at], domain = b[(at + 1)...]
        guard !local.isEmpty, local.count <= 64, local.allSatisfy({ isAlnum($0) || localExtra.contains($0) }) else { return false }
        return domain.split(separator: 0x2E, omittingEmptySubsequences: false).allSatisfy(validLabel)
    }

    /// Trims ASCII whitespace, validates and lowercases the domain; the local part keeps its case.
    public static func emailNormalize(_ s: String) throws -> String {
        let ws: Set<UInt8> = [0x09, 0x0A, 0x0C, 0x0D, 0x20]
        let b = Array(s.utf8)
        let start = b.firstIndex(where: { !ws.contains($0) }) ?? b.count
        let end = (b.lastIndex(where: { !ws.contains($0) }) ?? -1) + 1
        let t = start < end ? Array(b[start..<end]) : []
        let text = String(decoding: t, as: UTF8.self)
        guard emailValid(text), let at = t.firstIndex(of: 0x40) else { throw EmailError.invalidArgument("invalid e-mail address") }
        let domain = t[(at + 1)...].map { (0x41...0x5A).contains($0) ? $0 + 32 : $0 }
        return String(decoding: t[...at] + domain, as: UTF8.self)
    }
}
