// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

/// <summary>WCAG 2.x relative luminance and contrast ratio for #rgb / #rrggbb colors.</summary>
public static class WcagContrast {
    /// <summary>Relative luminance in [0, 1]; throws <see cref="FormatException"/> for anything but #rgb or #rrggbb.</summary>
    public static double RelativeLuminance(string hex) {
        ArgumentNullException.ThrowIfNull(hex);
        if (hex.Length is not (4 or 7) || hex[0] != '#' || !hex[1..].All(Uri.IsHexDigit)) throw new FormatException("color must be #rgb or #rrggbb: " + hex);
        string h = hex.Length == 4 ? string.Concat(hex[1..].Select(c => new string(c, 2))) : hex[1..];
        double Channel(int i) {
            double c = int.Parse(h.AsSpan(i * 2, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255.0;
            return c <= 0.04045 ? c / 12.92 : Math.Pow((c + 0.055) / 1.055, 2.4);
        }
        return 0.2126 * Channel(0) + 0.7152 * Channel(1) + 0.0722 * Channel(2);
    }

    /// <summary>(Lmax + 0.05) / (Lmin + 0.05), from 1 to 21.</summary>
    public static double ContrastRatio(string a, string b) {
        double la = RelativeLuminance(a), lb = RelativeLuminance(b);
        return (Math.Max(la, lb) + 0.05) / (Math.Min(la, lb) + 0.05);
    }

    /// <summary>The contrast ratio rounded to 2 decimals, half away from zero (for display).</summary>
    public static double ContrastRatio2(string a, string b) => Math.Round(ContrastRatio(a, b) * 100, MidpointRounding.AwayFromZero) / 100;

    /// <summary>Whether an unrounded ratio meets level "AA" (4.5, large 3.0) or "AAA" (7.0, large 4.5).</summary>
    public static bool Passes(double ratio, string level, bool largeText) => level switch {
        "AA" => ratio >= (largeText ? 3.0 : 4.5),
        "AAA" => ratio >= (largeText ? 4.5 : 7.0),
        _ => throw new ArgumentException("level must be AA or AAA", nameof(level)),
    };
}
