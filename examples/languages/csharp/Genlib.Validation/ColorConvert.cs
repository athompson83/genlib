// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

/// <summary>
/// Color conversions: CSS hex, sRGB, HSL and OKLCH (Björn Ottosson's Oklab, 2020). Channels r, g, b and alpha are 0..1 doubles;
/// HSL h is degrees [0, 360) with s and l in 0..1; OKLCH L is 0..1, C &gt;= 0 and h in degrees.
/// </summary>
public static class ColorConvert {
    private static double Mod(double x, double m) { // Python-style floored modulo
        double r = x % m;
        if (r != 0 && (r < 0) != (m < 0)) r += m;
        return r;
    }

    private static int HexDigit(char c) => c switch {
        >= '0' and <= '9' => c - '0',
        >= 'a' and <= 'f' => c - 'a' + 10,
        >= 'A' and <= 'F' => c - 'A' + 10,
        _ => -1,
    };

    /// <summary>"#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) to (r, g, b, a) in 0..1; throws <see cref="FormatException"/> otherwise.</summary>
    public static (double R, double G, double B, double A) ParseHex(string text) {
        ArgumentNullException.ThrowIfNull(text);
        int n = text.Length - 1;
        if (text.Length == 0 || text[0] != '#' || n is not (3 or 4 or 6 or 8) || text.Skip(1).Any(c => HexDigit(c) < 0))
            throw new FormatException("expected #rgb, #rgba, #rrggbb or #rrggbbaa");
        string h = text[1..];
        if (n <= 4) h = string.Concat(h.Select(c => new string(c, 2)));
        var vals = new double[h.Length / 2];
        for (int i = 0; i < vals.Length; i++) vals[i] = (HexDigit(h[2 * i]) * 16 + HexDigit(h[2 * i + 1])) / 255.0;
        return (vals[0], vals[1], vals[2], vals.Length == 4 ? vals[3] : 1.0);
    }

    private static int Byte(double v) => (int)Math.Min(255, Math.Max(0, Math.Floor(v * 255 + 0.5)));

    /// <summary>Lowercase "#rrggbb" (or "#rrggbbaa" when a &lt; 1); channels are clamped to 0..1 and rounded half up.</summary>
    public static string ToHex(double r, double g, double b, double a = 1.0) {
        string Ch(double v) => Byte(Math.Min(1, Math.Max(0, v))).ToString("x2", CultureInfo.InvariantCulture);
        string output = "#" + Ch(r) + Ch(g) + Ch(b);
        if (a < 1) output += Byte(Math.Max(0, a)).ToString("x2", CultureInfo.InvariantCulture);
        return output;
    }

    /// <summary>sRGB (0..1) to HSL (h degrees in [0, 360), s and l in 0..1).</summary>
    public static (double H, double S, double L) RgbToHsl(double r, double g, double b) {
        double mx = Math.Max(r, Math.Max(g, b)), mn = Math.Min(r, Math.Min(g, b)), l = (mx + mn) / 2, d = mx - mn;
        if (d == 0) return (0.0, 0.0, l);
        double s = d / (1 - Math.Abs(2 * l - 1)), h;
        if (mx == r) h = Mod((g - b) / d, 6);
        else if (mx == g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return (Mod(h * 60, 360), s, l);
    }

    /// <summary>HSL (h wraps modulo 360) to sRGB channels in 0..1.</summary>
    public static (double R, double G, double B) HslToRgb(double h, double s, double l) {
        h = Mod(h, 360);
        double c = (1 - Math.Abs(2 * l - 1)) * s, x = c * (1 - Math.Abs(Mod(h / 60, 2) - 1)), m = l - c / 2;
        var (r, g, b) = ((int)Math.Floor(h / 60) % 6) switch {
            0 => (c, x, 0.0), 1 => (x, c, 0.0), 2 => (0.0, c, x), 3 => (0.0, x, c), 4 => (x, 0.0, c), _ => (c, 0.0, x),
        };
        return (r + m, g + m, b + m);
    }

    private static double Lin(double c) => c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
    private static double Gam(double c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.Pow(c, 1 / 2.4) - 0.055;
    private static double Cbrt(double x) => Math.CopySign(Math.Pow(Math.Abs(x), 1.0 / 3), x);

    /// <summary>sRGB (0..1) to OKLCH (L, C, h degrees; h is 0 for achromatic colors with C &lt;= 1e-7).</summary>
    public static (double L, double C, double H) RgbToOklch(double r, double g, double b) {
        r = Lin(r); g = Lin(g); b = Lin(b);
        double l = Cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        double m = Cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        double s = Cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        double bigL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        double bigA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        double bigB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        double c = double.Hypot(bigA, bigB);
        double h = c > 1e-7 ? Mod(Math.Atan2(bigB, bigA) * (180 / Math.PI), 360) : 0.0;
        return (bigL, c, h);
    }

    /// <summary>OKLCH to sRGB channels, not clamped (values outside 0..1 mean the color is outside the sRGB gamut).</summary>
    public static (double R, double G, double B) OklchToRgb(double lightness, double chroma, double hue) {
        double rad = hue * (Math.PI / 180), a = chroma * Math.Cos(rad), b = chroma * Math.Sin(rad);
        double l = Math.Pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
        double m = Math.Pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
        double s = Math.Pow(lightness - 0.0894841775 * a - 1.2914855480 * b, 3);
        double r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        double g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        double bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return (Gam(r), Gam(g), Gam(bl));
    }

    /// <summary>True when every channel lies in 0..1 within <paramref name="eps"/>.</summary>
    public static bool InGamut(double r, double g, double b, double eps = 1e-9) =>
        new[] { r, g, b }.All(v => v >= -eps && v <= 1 + eps);
}
