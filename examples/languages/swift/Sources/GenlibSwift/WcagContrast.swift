// SPDX-License-Identifier: Apache-2.0
// WCAG 2.x relative luminance and contrast ratio for #rgb/#rrggbb colors, with AA/AAA checks for normal and large text.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum ContrastError: Error, Equatable {
    case invalidArgument(String)
}

public enum WcagLevel: Sendable {
    case aa, aaa
}

public enum WcagContrast {
    private static func parseHex(_ hex: String) throws -> [Double] {
        let b = Array(hex.utf8)
        let bad = ContrastError.invalidArgument("color must be #rgb or #rrggbb: \"\(hex)\"")
        guard b.first == UInt8(ascii: "#") else { throw bad }
        var nibbles: [Int] = []
        for c in b.dropFirst() {
            switch c {
            case 0x30...0x39: nibbles.append(Int(c - 0x30))
            case 0x61...0x66: nibbles.append(Int(c - 0x61 + 10))
            case 0x41...0x46: nibbles.append(Int(c - 0x41 + 10))
            default: throw bad
            }
        }
        switch nibbles.count {
        case 3: return nibbles.map { Double($0 * 17) }
        case 6: return [0, 2, 4].map { Double(nibbles[$0] * 16 + nibbles[$0 + 1]) }
        default: throw bad
        }
    }

    private static func linear(_ channel: Double) -> Double {
        let c = channel / 255
        return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    /// Relative luminance in [0, 1].
    public static func relativeLuminance(_ hex: String) throws -> Double {
        let rgb = try parseHex(hex)
        return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2])
    }

    /// Contrast ratio in [1, 21], unrounded.
    public static func contrastRatio(_ a: String, _ b: String) throws -> Double {
        let la = try relativeLuminance(a), lb = try relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /// Contrast ratio rounded to 2 decimals, half away from zero (for display).
    public static func contrastRatio2(_ a: String, _ b: String) throws -> Double {
        (try contrastRatio(a, b) * 100).rounded(.toNearestOrAwayFromZero) / 100
    }

    /// Whether an unrounded `ratio` meets `level` (AA 4.5, large 3.0; AAA 7.0, large 4.5).
    public static func passes(_ ratio: Double, level: WcagLevel, largeText: Bool) -> Bool {
        switch (level, largeText) {
        case (.aa, false): return ratio >= 4.5
        case (.aa, true): return ratio >= 3.0
        case (.aaa, false): return ratio >= 7.0
        case (.aaa, true): return ratio >= 4.5
        }
    }
}
