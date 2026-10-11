// SPDX-License-Identifier: Apache-2.0
// Color conversions: CSS hex, sRGB, HSL and OKLCH (Björn Ottosson's Oklab, 2020). Channels r, g, b and alpha are
// 0...1 doubles; HSL h is degrees [0, 360) with s and l in 0...1; OKLCH L is 0...1, C >= 0 and h in degrees.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum ColorError: Error, Equatable {
    case invalidArgument(String)
}

public enum ColorConvert {
    /// Python-style floored modulo for doubles (result takes the divisor's sign).
    private static func pmod(_ a: Double, _ b: Double) -> Double {
        var m = fmod(a, b)
        if m != 0 { if (b < 0) != (m < 0) { m += b } } else { m = copysign(0, b) }
        return m
    }

    /// '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa' (case-insensitive) as channels in 0...1 (alpha 1 when absent).
    public static func parseHex(_ text: String) throws -> (r: Double, g: Double, b: Double, a: Double) {
        let s = Array(text.unicodeScalars)
        func hexValue(_ c: Unicode.Scalar) -> Int? {
            switch c.value {
            case 0x30...0x39: return Int(c.value - 0x30)
            case 0x41...0x46: return Int(c.value - 0x41 + 10)
            case 0x61...0x66: return Int(c.value - 0x61 + 10)
            default: return nil
            }
        }
        guard s.first == "#", [4, 5, 7, 9].contains(s.count) else { throw ColorError.invalidArgument("expected #rgb, #rgba, #rrggbb or #rrggbbaa") }
        var digits: [Int] = []
        for c in s.dropFirst() {
            guard let v = hexValue(c) else { throw ColorError.invalidArgument("expected #rgb, #rgba, #rrggbb or #rrggbbaa") }
            digits.append(v)
        }
        if digits.count <= 4 { digits = digits.flatMap { [$0, $0] } }
        var vals: [Double] = []
        for i in stride(from: 0, to: digits.count, by: 2) { vals.append(Double(digits[i] * 16 + digits[i + 1]) / 255) }
        return (vals[0], vals[1], vals[2], vals.count == 4 ? vals[3] : 1.0)
    }

    private static func byte(_ v: Double) -> Int { min(255, max(0, Int(floor(min(1, max(0, v)) * 255 + 0.5)))) }

    private static func hex2(_ v: Int) -> String { let s = String(v, radix: 16); return s.count == 1 ? "0" + s : s }

    /// Lowercase #rrggbb (or #rrggbbaa when a < 1); channels are clamped to 0...1 and rounded half up.
    public static func toHex(_ r: Double, _ g: Double, _ b: Double, _ a: Double = 1) -> String {
        var out = "#" + [r, g, b].map { hex2(byte($0)) }.joined()
        if a < 1 { out += hex2(min(255, max(0, Int(floor(max(0, a) * 255 + 0.5))))) }
        return out
    }

    /// sRGB channels to HSL (h in degrees [0, 360); h and s are 0 for grays).
    public static func rgbToHsl(_ r: Double, _ g: Double, _ b: Double) -> (h: Double, s: Double, l: Double) {
        let mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2, d = mx - mn
        if d == 0 { return (0, 0, l) }
        let s = d / (1 - abs(2 * l - 1))
        let h: Double
        if mx == r { h = pmod((g - b) / d, 6) } else if mx == g { h = (b - r) / d + 2 } else { h = (r - g) / d + 4 }
        return (pmod(h * 60, 360), s, l)
    }

    /// HSL to sRGB channels; h wraps modulo 360.
    public static func hslToRgb(_ h0: Double, _ s: Double, _ l: Double) -> (r: Double, g: Double, b: Double) {
        let h = pmod(h0, 360), c = (1 - abs(2 * l - 1)) * s, x = c * (1 - abs(pmod(h / 60, 2) - 1)), m = l - c / 2
        let sector = ((Int(floor(h / 60)) % 6) + 6) % 6
        let parts: [(Double, Double, Double)] = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)]
        let (r, g, b) = parts[sector]
        return (r + m, g + m, b + m)
    }

    private static func lin(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    private static func gam(_ c: Double) -> Double { c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055 }
    private static func cbrt3(_ x: Double) -> Double { copysign(pow(abs(x), 1.0 / 3.0), x) }

    /// sRGB channels to OKLCH (hue 0 when chroma is below 1e-7).
    public static func rgbToOklch(_ r0: Double, _ g0: Double, _ b0: Double) -> (l: Double, c: Double, h: Double) {
        let r = lin(r0), g = lin(g0), b = lin(b0)
        let l = cbrt3(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        let m = cbrt3(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        let s = cbrt3(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        let L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        let A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        let B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        let C = hypot(A, B)
        let H = C > 1e-7 ? pmod(atan2(B, A) * (180.0 / Double.pi), 360) : 0
        return (L, C, H)
    }

    /// OKLCH to sRGB channels, not clamped (values outside 0...1 mean the color is outside the sRGB gamut).
    public static func oklchToRgb(_ L: Double, _ C: Double, _ H: Double) -> (r: Double, g: Double, b: Double) {
        let rad = H * (Double.pi / 180.0)
        let A = C * cos(rad), B = C * sin(rad)
        let l = pow(L + 0.3963377774 * A + 0.2158037573 * B, 3)
        let m = pow(L - 0.1055613458 * A - 0.0638541728 * B, 3)
        let s = pow(L - 0.0894841775 * A - 1.2914855480 * B, 3)
        let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        let b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        return (gam(r), gam(g), gam(b))
    }

    /// True when every channel lies within 0...1 (allowing eps).
    public static func inGamut(_ r: Double, _ g: Double, _ b: Double, eps: Double = 1e-9) -> Bool {
        [r, g, b].allSatisfy { $0 >= -eps && $0 <= 1 + eps }
    }
}
