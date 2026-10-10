// SPDX-License-Identifier: Apache-2.0
// NIST SP 800-63B style password check without composition rules. Use a large breached-password list as the blocklist,
// allow every printable character (spaces and emoji included), never truncate, and rate-limit attempts server-side.
// Lengths count Unicode code points. Failures, in order: too-short, too-long, control-characters, blocklisted,
// contains-context, repetitive.

public enum PasswordPolicyError: Error, Equatable {
    case invalidArgument(String)
}

public struct PasswordOptions: Equatable {
    public var minLength: Int
    public var maxLength: Int
    public var blocklist: [String]
    public var context: [String]  // user-specific words such as the email local part or the site name
    public init(minLength: Int = 15, maxLength: Int = 64, blocklist: [String] = [], context: [String] = []) {
        self.minLength = minLength; self.maxLength = maxLength; self.blocklist = blocklist; self.context = context
    }
}

public struct PasswordCheck: Equatable {
    public var ok: Bool
    public var failures: [String]
    public init(ok: Bool, failures: [String]) { self.ok = ok; self.failures = failures }
}

public enum PasswordPolicy {
    private static let alnum = Array("0123456789abcdefghijklmnopqrstuvwxyz".unicodeScalars.map(\.value))

    private static func lower(_ s: String) -> [UInt32] {
        s.unicodeScalars.map { $0.value >= 0x41 && $0.value <= 0x5A ? $0.value + 32 : $0.value }
    }

    private static func contains(_ hay: [UInt32], _ needle: [UInt32]) -> Bool {
        if needle.isEmpty { return true }
        if needle.count > hay.count { return false }
        for i in 0...(hay.count - needle.count) where Array(hay[i..<(i + needle.count)]) == needle { return true }
        return false
    }

    public static func checkPassword(_ password: String, _ options: PasswordOptions = PasswordOptions()) throws -> PasswordCheck {
        guard options.minLength >= 1, options.maxLength >= options.minLength else {
            throw PasswordPolicyError.invalidArgument("need 1 <= minLength <= maxLength")
        }
        let cps = password.unicodeScalars.map(\.value), low = lower(password)
        var failures: [String] = []
        if cps.count < options.minLength { failures.append("too-short") }
        if cps.count > options.maxLength { failures.append("too-long") }
        if cps.contains(where: { $0 < 0x20 || (0x7F...0x9F).contains($0) }) { failures.append("control-characters") }
        if options.blocklist.contains(where: { lower($0) == low }) { failures.append("blocklisted") }
        if options.context.contains(where: { $0.unicodeScalars.count >= 4 && contains(low, lower($0)) }) {
            failures.append("contains-context")
        }
        var repetitive = false
        if cps.count >= 4 {
            for i in 0...(cps.count - 4) {
                let w = Array(cps[i..<(i + 4)]), lw = Array(low[i..<(i + 4)])
                if w.allSatisfy({ $0 == w[0] }) { repetitive = true; break }
                if lw.allSatisfy({ alnum.contains($0) }) && (contains(alnum, lw) || contains(alnum, lw.reversed())) {
                    repetitive = true; break
                }
            }
        }
        if repetitive { failures.append("repetitive") }
        return PasswordCheck(ok: failures.isEmpty, failures: failures)
    }
}
