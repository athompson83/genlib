// SPDX-License-Identifier: Apache-2.0
// Password and passphrase generation with an injected byte source (nextByte returns 0...255) so results are
// reproducible in tests; omit it to use the platform CSPRNG (SystemRandomNumberGenerator, which reads the operating
// system's secure random source). Indexes use unbiased rejection sampling; passwords take one character from each class
// in class order, fill the rest from the union of the classes, then Fisher-Yates shuffle.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum PasswordGenerateError: Error, Equatable {
    case invalidArgument(String)
}

public enum PasswordGenerate {
    private static let classTable: [String: String] = [
        "lower": "abcdefghijklmnopqrstuvwxyz",
        "upper": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "digits": "0123456789",
        "symbols": "!#$%&*+-=?@^_~",
    ]
    private static let ambiguous: Set<Character> = ["I", "l", "1", "O", "0", "o"]

    /// One byte from the operating system CSPRNG.
    public static func secureByte() -> UInt8 {
        var g = SystemRandomNumberGenerator()
        return UInt8.random(in: 0...255, using: &g)
    }

    /// Unbiased index in 0..<n by rejection sampling over the fewest big-endian bytes covering n (n up to 2^56).
    public static func randomIndex(_ n: Int, _ nextByte: () -> UInt8 = secureByte) throws -> Int {
        guard n >= 1 else { throw PasswordGenerateError.invalidArgument("n must be positive") }
        guard n <= 1 << 56 else { throw PasswordGenerateError.invalidArgument("n must be at most 2^56") }
        if n == 1 { return 0 }
        var k = 1
        while 1 << (8 * k) < n { k += 1 }
        let limit = ((1 << (8 * k)) / n) * n
        while true {
            var x = 0
            for _ in 0..<k { x = x * 256 + Int(nextByte()) }
            if x < limit { return x % n }
        }
    }

    /// Generates a password of length (classes.count...1024) from the given classes (lower, upper, digits, symbols).
    public static func generatePassword(length: Int = 16, classes: [String] = ["lower", "upper", "digits", "symbols"],
                                        excludeAmbiguous: Bool = false, nextByte: () -> UInt8 = secureByte) throws -> String {
        guard !classes.isEmpty, Set(classes).count == classes.count, classes.allSatisfy({ classTable[$0] != nil }) else {
            throw PasswordGenerateError.invalidArgument("bad classes")
        }
        guard length >= classes.count, length <= 1024 else { throw PasswordGenerateError.invalidArgument("bad length") }
        let alphabets = classes.map { c in Array(classTable[c]!).filter { !(excludeAmbiguous && ambiguous.contains($0)) } }
        var out = try alphabets.map { a in a[try randomIndex(a.count, nextByte)] }
        let union = alphabets.flatMap { $0 }
        for _ in classes.count..<length { out.append(union[try randomIndex(union.count, nextByte)]) }
        var i = out.count - 1
        while i > 0 {
            out.swapAt(i, try randomIndex(i + 1, nextByte))
            i -= 1
        }
        return String(out)
    }

    /// Joins count (1...64) words chosen from words (at least 2 distinct, non-empty) with separator.
    public static func generatePassphrase(words: [String], count: Int = 5, separator: String = "-",
                                          nextByte: () -> UInt8 = secureByte) throws -> String {
        guard (1...64).contains(count), Set(words.map { Array($0.unicodeScalars.map(\.value)) }).count >= 2,
              words.allSatisfy({ !$0.isEmpty }) else { throw PasswordGenerateError.invalidArgument("bad arguments") }
        return try (0..<count).map { _ in words[try randomIndex(words.count, nextByte)] }.joined(separator: separator)
    }

    /// length * log2(alphabetSize) rounded to 2 decimals (for strength meters).
    public static func entropyBits(alphabetSize: Int, length: Int) throws -> Double {
        guard alphabetSize >= 1, length >= 0 else { throw PasswordGenerateError.invalidArgument("bad arguments") }
        return (Double(length) * log2(Double(alphabetSize)) * 100).rounded() / 100
    }
}
