// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Punycode (RFC 3492 bootstring: base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter '-')
/// with 31-bit overflow checks, plus simplified IDNA-style domain conversion. Strings are processed by code point. Errors throw
/// <see cref="FormatException"/> (invalid digit, overflow, non-basic code point before the delimiter, truncated input, a
/// surrogate or a value above U+10FFFF, empty or over-long labels, names over 253 octets).
/// </summary>
public static class Punycode {
    private const int Base = 36, TMin = 1, TMax = 26, Skew = 38, Damp = 700, InitialBias = 72, InitialN = 128;
    private const long MaxInt = int.MaxValue;

    /// <summary>Encodes a Unicode string to its Punycode form (no 'xn--' prefix).</summary>
    public static string Encode(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var cps = CodePoints(s);
        var output = new StringBuilder();
        foreach (int c in cps) if (c < 0x80) output.Append((char)c);
        int b = output.Length, h = b;
        if (b > 0) output.Append('-');
        long n = InitialN, delta = 0; int bias = InitialBias;
        while (h < cps.Count) {
            long m = long.MaxValue;
            foreach (int c in cps) if (c >= n && c < m) m = c;
            if ((m - n) * (h + 1) > MaxInt - delta) throw new FormatException("overflow");
            delta += (m - n) * (h + 1); n = m;
            foreach (int c in cps) {
                if (c < n) {
                    delta++;
                    if (delta > MaxInt) throw new FormatException("overflow");
                }
                if (c == n) {
                    long q = delta;
                    for (int k = Base; ; k += Base) {
                        int t = k <= bias ? TMin : k >= bias + TMax ? TMax : k - bias;
                        if (q < t) break;
                        output.Append(Digit((int)(t + (q - t) % (Base - t))));
                        q = (q - t) / (Base - t);
                    }
                    output.Append(Digit((int)q));
                    bias = Adapt(delta, h + 1, h == b);
                    delta = 0; h++;
                }
            }
            delta++; n++;
        }
        return output.ToString();
    }

    /// <summary>Decodes a Punycode string (digits in either case) to Unicode; throws FormatException on invalid input.</summary>
    public static string Decode(string s) {
        ArgumentNullException.ThrowIfNull(s);
        int i = s.LastIndexOf('-');
        var output = new List<int>();
        if (i > 0) {
            for (int j = 0; j < i; j++) {
                if (s[j] >= 0x80) throw new FormatException("non-basic code point");
                output.Add(s[j]);
            }
        }
        int pos = i >= 0 ? i + 1 : 0;
        long n = InitialN, idx = 0; int bias = InitialBias;
        while (pos < s.Length) {
            long old = idx, w = 1;
            for (int k = Base; ; k += Base) {
                if (pos >= s.Length) throw new FormatException("truncated input");
                int d = Value(s[pos++]);
                if (d > (MaxInt - idx) / w) throw new FormatException("overflow");
                idx += d * w;
                int t = k <= bias ? TMin : k >= bias + TMax ? TMax : k - bias;
                if (d < t) break;
                if (w > MaxInt / (Base - t)) throw new FormatException("overflow");
                w *= Base - t;
            }
            int len = output.Count + 1;
            bias = Adapt(idx - old, len, old == 0);
            if (idx / len > MaxInt - n) throw new FormatException("overflow");
            n += idx / len; idx %= len;
            if (n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) throw new FormatException("invalid code point");
            output.Insert((int)idx, (int)n);
            idx++;
        }
        var sb = new StringBuilder();
        foreach (int cp in output) sb.Append(char.ConvertFromUtf32(cp));
        return sb.ToString();
    }

    /// <summary>
    /// Converts a domain to ASCII: lowercases ASCII letters only, encodes each label with a non-ASCII code point as 'xn--' +
    /// Punycode, keeps one trailing dot; no Unicode normalization or IDNA (UTS #46) mapping is applied, so normalize first if needed.
    /// </summary>
    public static string DomainToAscii(string domain) {
        ArgumentNullException.ThrowIfNull(domain);
        bool trailing = domain.EndsWith('.') && domain.Length > 1;
        var labels = (trailing ? domain[..^1] : domain).Split('.');
        var result = new List<string>();
        foreach (var label in labels) {
            if (label.Length == 0) throw new FormatException("empty label");
            var sb = new StringBuilder(label.Length);
            bool nonAscii = false;
            foreach (char c in label) {
                if (c < 0x80) sb.Append(c >= 'A' && c <= 'Z' ? (char)(c + 32) : c);
                else { sb.Append(c); nonAscii = true; }
            }
            string a = nonAscii ? "xn--" + Encode(sb.ToString()) : sb.ToString();
            if (a.Length > 63) throw new FormatException("label too long");
            result.Add(a);
        }
        string output = string.Join('.', result);
        if (output.Length > 253) throw new FormatException("name too long");
        return output + (trailing ? "." : "");
    }

    /// <summary>Converts a domain to Unicode by decoding each label that starts with 'xn--' (any case); no normalization or IDNA mapping.</summary>
    public static string DomainToUnicode(string domain) {
        ArgumentNullException.ThrowIfNull(domain);
        return string.Join('.', domain.Split('.').Select(l =>
            l.Length >= 4 && string.Equals(l[..4], "xn--", StringComparison.OrdinalIgnoreCase) ? Decode(l[4..]) : l));
    }

    private static int Adapt(long delta, int num, bool first) {
        delta = first ? delta / Damp : delta / 2;
        delta += delta / num;
        int k = 0;
        while (delta > ((Base - TMin) * TMax) / 2) { delta /= Base - TMin; k += Base; }
        return (int)(k + (Base - TMin + 1) * delta / (delta + Skew));
    }

    private static char Digit(int d) => (char)(d + 22 + (d < 26 ? 75 : 0));

    private static int Value(char c) {
        if (c >= '0' && c <= '9') return c - 22;
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a';
        throw new FormatException("invalid digit");
    }

    // Code points; a lone surrogate counts as one code point.
    private static List<int> CodePoints(string s) {
        var list = new List<int>(s.Length);
        for (int i = 0; i < s.Length; i++) {
            if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { list.Add(char.ConvertToUtf32(s[i], s[i + 1])); i++; }
            else list.Add(s[i]);
        }
        return list;
    }
}
