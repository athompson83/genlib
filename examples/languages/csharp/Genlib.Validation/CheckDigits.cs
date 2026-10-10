// SPDX-License-Identifier: Apache-2.0
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Check-digit validation: Luhn (payment cards), IBAN (ISO 13616 mod 97), GTIN/EAN/UPC and ISBN-10/13.</summary>
public static class CheckDigits {
    private static readonly Regex Iban = new("^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\\z", RegexOptions.CultureInvariant);

    /// <summary>True when <paramref name="s"/> (spaces and hyphens ignored) is at least two ASCII digits with a valid Luhn checksum.</summary>
    public static bool LuhnValid(string s) {
        if (s is null) return false;
        string t = Strip(s);
        if (t.Length < 2 || !AllDigits(t)) return false;
        int total = 0;
        for (int i = 0; i < t.Length; i++) {
            int d = t[t.Length - 1 - i] - '0';
            if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9; }
            total += d;
        }
        return total % 10 == 0;
    }

    /// <summary>The digit that makes payload + digit Luhn-valid; throws <see cref="FormatException"/> for a non-digit payload.</summary>
    public static string LuhnCheckDigit(string payload) {
        ArgumentNullException.ThrowIfNull(payload);
        string t = Strip(payload);
        if (t.Length == 0 || !AllDigits(t)) throw new FormatException("Luhn payload must be ASCII digits");
        for (int d = 0; d < 10; d++) if (LuhnValid(t + d)) return d.ToString();
        throw new InvalidOperationException("unreachable");
    }

    /// <summary>True when <paramref name="s"/> (spaces ignored, case-insensitive) has IBAN shape and its mod-97 remainder is 1.</summary>
    public static bool IbanValid(string s) {
        if (s is null) return false;
        string t = s.Replace(" ", "").ToUpperInvariant();
        if (!Iban.IsMatch(t)) return false;
        string r = t[4..] + t[..4];
        int rem = 0;
        foreach (char c in r) {
            int v = c <= '9' ? c - '0' : c - 55;
            rem = (rem * (v > 9 ? 100 : 10) + v) % 97;
        }
        return rem == 1;
    }

    /// <summary>A valid IBAN as uppercase groups of four; throws <see cref="FormatException"/> when invalid.</summary>
    public static string IbanFormat(string s) {
        ArgumentNullException.ThrowIfNull(s);
        string t = s.Replace(" ", "").ToUpperInvariant();
        if (!IbanValid(t)) throw new FormatException("invalid IBAN");
        return string.Join(' ', t.Chunk(4).Select(c => new string(c)));
    }

    /// <summary>True for a GTIN-8/12/13/14 (EAN/UPC) whose weighted sum (1,3,1,3... from the right) is a multiple of 10.</summary>
    public static bool GtinValid(string s) {
        if (s is null) return false;
        string t = Strip(s);
        if (!AllDigits(t) || t.Length is not (8 or 12 or 13 or 14)) return false;
        int total = 0;
        for (int i = 0; i < t.Length; i++) total += (t[t.Length - 1 - i] - '0') * (i % 2 == 1 ? 3 : 1);
        return total % 10 == 0;
    }

    /// <summary>True for an ISBN-10 (nine digits then a digit or X, weighted mod 11).</summary>
    public static bool Isbn10Valid(string s) {
        if (s is null) return false;
        string t = Strip(s).ToUpperInvariant();
        if (t.Length != 10 || !AllDigits(t[..9]) || !(char.IsAsciiDigit(t[9]) || t[9] == 'X')) return false;
        int total = 0;
        for (int i = 0; i < 10; i++) total += (10 - i) * (t[i] == 'X' ? 10 : t[i] - '0');
        return total % 11 == 0;
    }

    /// <summary>True for a 978/979-prefixed ISBN-13 with a valid GTIN check digit.</summary>
    public static bool Isbn13Valid(string s) {
        if (s is null) return false;
        string t = Strip(s);
        return t.Length == 13 && (t.StartsWith("978", StringComparison.Ordinal) || t.StartsWith("979", StringComparison.Ordinal)) && GtinValid(t);
    }

    /// <summary>Converts a valid ISBN-10 to its 978-prefixed ISBN-13; throws <see cref="FormatException"/> when invalid.</summary>
    public static string Isbn10To13(string s) {
        ArgumentNullException.ThrowIfNull(s);
        string t = Strip(s).ToUpperInvariant();
        if (!Isbn10Valid(t)) throw new FormatException("invalid ISBN-10");
        string body = "978" + t[..9];
        for (int d = 0; d < 10; d++) if (GtinValid(body + d)) return body + d;
        throw new InvalidOperationException("unreachable");
    }

    private static string Strip(string s) => s.Replace(" ", "").Replace("-", "");
    private static bool AllDigits(string s) => s.Length > 0 && s.All(char.IsAsciiDigit);
}
