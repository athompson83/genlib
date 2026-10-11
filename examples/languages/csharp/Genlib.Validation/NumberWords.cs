// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// English number words, US style without "and" ("one hundred five", "forty-two"), for |n| &lt; 10^15, plus ordinals, ordinal
/// suffixes and money amounts in minor units. Out-of-range input throws <see cref="ArgumentOutOfRangeException"/>.
/// </summary>
public static class NumberWords {
    private static readonly string[] Ones = { "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen" };
    private static readonly string[] Tens = { "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety" };
    private static readonly string[] Scales = { "", "thousand", "million", "billion", "trillion" };
    private static readonly Dictionary<string, string> Irregular = new() {
        ["one"] = "first", ["two"] = "second", ["three"] = "third", ["five"] = "fifth", ["eight"] = "eighth", ["nine"] = "ninth", ["twelve"] = "twelfth",
    };
    private const long Limit = 1_000_000_000_000_000;

    private static string Under1000(int n) {
        var parts = new List<string>();
        if (n >= 100) { parts.Add(Ones[n / 100] + " hundred"); n %= 100; }
        if (n >= 20) parts.Add(Tens[n / 10] + (n % 10 != 0 ? "-" + Ones[n % 10] : ""));
        else if (n > 0) parts.Add(Ones[n]);
        return string.Join(" ", parts);
    }

    /// <summary>The number in words ("negative " prefix for n &lt; 0); |n| must be below 10^15.</summary>
    public static string NumberToWords(long n) {
        if (n <= -Limit || n >= Limit) throw new ArgumentOutOfRangeException(nameof(n), "range");
        if (n == 0) return "zero";
        if (n < 0) return "negative " + NumberToWords(-n);
        var groups = new List<string>();
        int i = 0;
        while (n > 0) {
            int g = (int)(n % 1000);
            if (g != 0) groups.Add(Under1000(g) + (Scales[i].Length > 0 ? " " + Scales[i] : ""));
            n /= 1000; i++;
        }
        groups.Reverse();
        return string.Join(" ", groups);
    }

    private static string Ordinalize(string w) {
        if (Irregular.TryGetValue(w, out var irregular)) return irregular;
        if (w.EndsWith('y')) return w[..^1] + "ieth";
        return w + "th";
    }

    /// <summary>The ordinal in words for n &gt;= 0 ("zeroth", "twenty-first", "one hundredth").</summary>
    public static string OrdinalWords(long n) {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n), "range");
        var words = NumberToWords(n).Split(' ');
        string last = words[^1];
        int dash = last.IndexOf('-');
        words[^1] = dash >= 0 ? last[..(dash + 1)] + Ordinalize(last[(dash + 1)..]) : Ordinalize(last);
        return string.Join(" ", words);
    }

    /// <summary>The number with its English ordinal suffix ("1st", "12th", "-22nd", "1001st").</summary>
    public static string OrdinalSuffix(long n) {
        ulong a = n < 0 ? (ulong)(-(n + 1)) + 1 : (ulong)n;
        string s = (a % 100) is 11 or 12 or 13 ? "th" : (a % 10) switch { 1 => "st", 2 => "nd", 3 => "rd", _ => "th" };
        return n.ToString(CultureInfo.InvariantCulture) + s;
    }

    /// <summary>A minor-unit amount in words ("one dollar and one cent"); singular for a count of 1, minor part omitted when 0; exponent 0..3.</summary>
    public static string MoneyWords(long minor, string majorName, string minorName, int exponent = 2) {
        ArgumentNullException.ThrowIfNull(majorName);
        ArgumentNullException.ThrowIfNull(minorName);
        if (minor < 0 || exponent is < 0 or > 3) throw new ArgumentOutOfRangeException(nameof(minor), "bad");
        long unit = exponent switch { 0 => 1, 1 => 10, 2 => 100, _ => 1000 };
        long whole = minor / unit, frac = minor % unit;
        var output = new StringBuilder(NumberToWords(whole)).Append(' ').Append(majorName);
        if (whole != 1) output.Append('s');
        if (exponent != 0 && frac != 0) {
            output.Append(" and ").Append(NumberToWords(frac)).Append(' ').Append(minorName);
            if (frac != 1) output.Append('s');
        }
        return output.ToString();
    }
}
