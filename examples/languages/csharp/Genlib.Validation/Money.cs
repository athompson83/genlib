// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Numerics;
using System.Text;

namespace Genlib.Validation;

/// <summary>Money as integer minor units: exact parsing and formatting, banker's rounding of rates, and remainder-safe allocation.</summary>
public static class Money {
    private static readonly Dictionary<string, int> Exponents = BuildExponents();

    private static Dictionary<string, int> BuildExponents() {
        var map = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var c in "USD EUR GBP CAD AUD CHF CNY INR MXN BRL SEK NOK DKK NZD SGD HKD ZAR".Split(' ')) map[c] = 2;
        foreach (var c in "JPY KRW VND CLP ISK".Split(' ')) map[c] = 0;
        foreach (var c in "BHD KWD JOD OMR TND".Split(' ')) map[c] = 3;
        return map;
    }

    /// <summary>The ISO 4217 minor-unit exponent of a supported currency code (uppercase).</summary>
    public static int Exponent(string currency) {
        if (currency is null || !Exponents.TryGetValue(currency, out int e))
            throw new ArgumentException($"unsupported currency '{currency}'", nameof(currency));
        return e;
    }

    /// <summary>Parses "-?DIGITS(.DIGITS)?" into minor units; more fraction digits than the currency allows is an error.</summary>
    public static long ToMinor(string amount, string currency) {
        int exp = Exponent(currency);
        var (negative, intPart, fracPart) = ParseDecimal(amount, nameof(amount));
        if (fracPart.Length > exp) throw new ArgumentException($"amount '{amount}' has more than {exp} fraction digits for {currency}", nameof(amount));
        var value = BigInteger.Parse(intPart + fracPart.PadRight(exp, '0'), CultureInfo.InvariantCulture);
        return ToInt64(negative ? -value : value, "amount");
    }

    /// <summary>Formats minor units as a plain decimal with exactly the currency's fraction digits (no symbol or grouping).</summary>
    public static string FormatMinor(long minor, string currency) {
        int exp = Exponent(currency);
        BigInteger abs = BigInteger.Abs(minor);
        string digits = abs.ToString(CultureInfo.InvariantCulture).PadLeft(exp + 1, '0');
        string sign = minor < 0 ? "-" : "";
        return exp == 0 ? sign + digits : sign + digits[..^exp] + "." + digits[^exp..];
    }

    /// <summary>Multiplies by a decimal rate (at most 9 fraction digits) and rounds the exact product half to even.</summary>
    public static long ApplyRate(long minor, string rate) {
        var (negative, intPart, fracPart) = ParseDecimal(rate, nameof(rate));
        if (fracPart.Length > 9) throw new ArgumentException($"rate '{rate}' has more than 9 fraction digits", nameof(rate));
        var numerator = BigInteger.Parse(intPart + fracPart, CultureInfo.InvariantCulture);
        if (negative) numerator = -numerator;
        var product = minor * numerator;
        var divisor = BigInteger.Pow(10, fracPart.Length);
        var quotient = BigInteger.DivRem(product, divisor, out var remainder);
        int cmp = (BigInteger.Abs(remainder) * 2).CompareTo(divisor);
        if (cmp > 0 || (cmp == 0 && !quotient.IsEven)) quotient += product.Sign;
        return ToInt64(quotient, "result");
    }

    /// <summary>Splits <paramref name="total"/> by non-negative integer ratios with the largest-remainder method: shares are
    /// floor(|total| * r / sum) and leftover units go one each to the entries with the largest remainder (|total| * r mod sum),
    /// ties to the lower index. Negative totals are allocated by magnitude and negated.</summary>
    public static long[] Allocate(long total, IReadOnlyList<long> ratios) {
        ArgumentNullException.ThrowIfNull(ratios);
        if (ratios.Count == 0) throw new ArgumentException("ratios must not be empty", nameof(ratios));
        BigInteger sum = BigInteger.Zero;
        foreach (long r in ratios) {
            if (r < 0) throw new ArgumentException("ratios must be non-negative", nameof(ratios));
            sum += r;
        }
        if (sum.IsZero) throw new ArgumentException("ratios must have a positive sum", nameof(ratios));
        BigInteger abs = BigInteger.Abs(total);
        var shares = new BigInteger[ratios.Count];
        var remainders = new BigInteger[ratios.Count];
        BigInteger allocated = BigInteger.Zero;
        for (int i = 0; i < shares.Length; i++) {
            shares[i] = BigInteger.DivRem(abs * ratios[i], sum, out remainders[i]);
            allocated += shares[i];
        }
        // OrderByDescending is stable, so equal remainders keep the lower index first.
        foreach (int i in Enumerable.Range(0, shares.Length).OrderByDescending(i => remainders[i]).Take((int)(abs - allocated)))
            shares[i] += 1;
        return shares.Select(s => ToInt64(total < 0 ? -s : s, "share")).ToArray();
    }

    private static (bool Negative, string Int, string Frac) ParseDecimal(string text, string param) {
        if (text is null) throw new ArgumentNullException(param);
        int i = 0;
        bool negative = text.Length > 0 && text[0] == '-';
        if (negative) i++;
        int intStart = i;
        while (i < text.Length && text[i] is >= '0' and <= '9') i++;
        string intPart = text[intStart..i];
        string fracPart = "";
        if (i < text.Length && text[i] == '.') {
            int fracStart = ++i;
            while (i < text.Length && text[i] is >= '0' and <= '9') i++;
            fracPart = text[fracStart..i];
            if (fracPart.Length == 0) i = -1;
        }
        if (intPart.Length == 0 || i != text.Length) throw new ArgumentException($"'{text}' is not a plain decimal (-?DIGITS(.DIGITS)?)", param);
        return (negative, intPart, fracPart);
    }

    private static long ToInt64(BigInteger value, string what) {
        if (value < long.MinValue || value > long.MaxValue) throw new OverflowException($"{what} does not fit in a 64-bit integer");
        return (long)value;
    }
}
