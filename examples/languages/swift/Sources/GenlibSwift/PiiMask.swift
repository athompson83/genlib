// SPDX-License-Identifier: Apache-2.0
// Display masking of personal data for logs and UIs (masking, not anonymization): e-mail addresses, phone numbers, card
// numbers, generic middle masking and free-text redaction of e-mails ([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})
// and Luhn-valid card numbers (13-19 digits optionally separated by single spaces or hyphens, not touching other
// digits). E-mail and middle masking count Unicode scalars. The free-text patterns are matched by hand with the same
// leftmost, greedy-with-backtracking results as the regular expressions.

public enum PiiMaskError: Error, Equatable {
    case invalid(String)
}

public enum PiiMask {
    private static func text<S: Sequence>(_ cps: S) -> String where S.Element == UInt32 {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    private static func isDigit(_ c: UInt32) -> Bool { (0x30...0x39).contains(c) }
    private static func isLetter(_ c: UInt32) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }
    private static func isUnicodeDigit(_ c: UInt32) -> Bool {
        Unicode.Scalar(c)?.properties.generalCategory == .decimalNumber
    }

    /// Masks the local part after its first scalar ("jane.doe@example.com" -> "j*******@example.com", at least 3 "*").
    public static func maskEmail(_ email: String) throws -> String {
        let cps = email.unicodeScalars.map(\.value)
        let parts = cps.split(separator: 0x40, omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { throw PiiMaskError.invalid("not an email address") }
        return text([parts[0].first!]) + String(repeating: "*", count: max(3, parts[0].count - 1)) + "@" + text(parts[1])
    }

    /// Masks every ASCII digit except the last 4 and a leading "+CC " country code; needs at least 7 digits.
    public static func maskPhone(_ phone: String) throws -> String {
        let cps = phone.unicodeScalars.map(\.value)
        let total = cps.filter(isDigit).count
        guard total >= 7 else { throw PiiMaskError.invalid("not a phone number") }
        var keepFront = 0
        if cps.first == 0x2B { // ^\+(\d{1,3}) with Unicode \d
            var j = 1
            while j < cps.count && isUnicodeDigit(cps[j]) { j += 1 }
            if (1...3).contains(j - 1) && j < cps.count && cps[j] == 0x20 { keepFront = j - 1 }
        }
        var seen = 0, out: [UInt32] = []
        for c in cps {
            if isDigit(c) {
                out.append(seen < keepFront || seen >= total - 4 ? c : 0x2A); seen += 1
            } else {
                out.append(c)
            }
        }
        return text(out)
    }

    /// Masks all but the last 4 digits of a 12-19 digit card number, keeping spaces and hyphens.
    public static func maskCard(_ card: String) throws -> String {
        let cps = card.unicodeScalars.map(\.value)
        guard !cps.isEmpty, cps.allSatisfy({ isDigit($0) || $0 == 0x20 || $0 == 0x2D }) else { throw PiiMaskError.invalid("not a card number") }
        let total = cps.filter(isDigit).count
        guard (12...19).contains(total) else { throw PiiMaskError.invalid("not a card number") }
        var seen = 0
        return text(cps.map { c -> UInt32 in
            guard isDigit(c) else { return c }
            defer { seen += 1 }
            return seen >= total - 4 ? c : 0x2A
        })
    }

    /// Keeps keepStart and keepEnd scalars and masks the rest (everything when the string is that short).
    public static func maskMiddle(_ s: String, keepStart: Int = 1, keepEnd: Int = 1, mask: String = "*") throws -> String {
        guard keepStart >= 0, keepEnd >= 0, mask.unicodeScalars.count == 1 else { throw PiiMaskError.invalid("bad arguments") }
        let cps = s.unicodeScalars.map(\.value)
        if cps.count <= keepStart + keepEnd { return String(repeating: mask, count: cps.count) }
        return text(cps.prefix(keepStart)) + String(repeating: mask, count: cps.count - keepStart - keepEnd) + text(cps.suffix(keepEnd))
    }

    private static func luhn(_ digits: [UInt32]) -> Bool {
        var sum = 0
        for (i, c) in digits.reversed().enumerated() {
            var n = Int(c) - 0x30
            if i % 2 == 1 { n = n * 2 > 9 ? n * 2 - 9 : n * 2 }
            sum += n
        }
        return sum % 10 == 0
    }

    // (?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9]) at s; returns the match end.
    private static func cardMatch(_ t: [UInt32], _ s: Int) -> Int? {
        guard isDigit(t[s]), s == 0 || !isDigit(t[s - 1]) else { return nil }
        var ends: [Int] = [], p = s + 1
        while ends.count < 18 {
            if p + 1 < t.count && (t[p] == 0x20 || t[p] == 0x2D) && isDigit(t[p + 1]) { p += 2 } else if p < t.count && isDigit(t[p]) { p += 1 } else { break }
            ends.append(p)
        }
        guard ends.count >= 12 else { return nil }
        for k in stride(from: ends.count, through: 12, by: -1) {
            let e = ends[k - 1]
            if e >= t.count || !isDigit(t[e]) { return e }
        }
        return nil
    }

    private static func isLocal(_ c: UInt32) -> Bool { isDigit(c) || isLetter(c) || [0x2E, 0x5F, 0x25, 0x2B, 0x2D].contains(c) }
    private static func isDomain(_ c: UInt32) -> Bool { isDigit(c) || isLetter(c) || c == 0x2E || c == 0x2D }

    // [A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,} at s; returns the match end.
    private static func emailMatch(_ t: [UInt32], _ s: Int) -> Int? {
        var at = s
        while at < t.count && isLocal(t[at]) { at += 1 }
        guard at > s, at < t.count, t[at] == 0x40 else { return nil }
        let a = at + 1
        var e = a
        while e < t.count && isDomain(t[e]) { e += 1 }
        var d = e - 1
        while d >= a + 1 {
            if t[d] == 0x2E && d + 2 < t.count && isLetter(t[d + 1]) && isLetter(t[d + 2]) {
                var end = d + 1
                while end < t.count && isLetter(t[end]) { end += 1 }
                return end
            }
            d -= 1
        }
        return nil
    }

    private static func substitute(_ t: [UInt32], _ match: ([UInt32], Int) -> Int?, _ replace: ([UInt32]) throws -> [UInt32]) rethrows -> [UInt32] {
        var out: [UInt32] = [], i = 0
        while i < t.count {
            if let e = match(t, i) {
                out += try replace(Array(t[i..<e])); i = e
            } else {
                out.append(t[i]); i += 1
            }
        }
        return out
    }

    /// Replaces e-mail addresses and Luhn-valid 13-19 digit card numbers in free text with their masked forms.
    public static func redact(_ text: String, kinds: [String] = ["email", "card"]) throws -> String {
        guard kinds.allSatisfy({ $0 == "email" || $0 == "card" }) else { throw PiiMaskError.invalid("unsupported kind") }
        var t = text.unicodeScalars.map(\.value)
        if kinds.contains("card") {
            t = try substitute(t, cardMatch) { m in
                luhn(m.filter(isDigit)) ? Array(try maskCard(self.text(m)).unicodeScalars.map(\.value)) : m
            }
        }
        if kinds.contains("email") {
            t = try substitute(t, emailMatch) { m in Array(try maskEmail(self.text(m)).unicodeScalars.map(\.value)) }
        }
        return self.text(t)
    }
}
