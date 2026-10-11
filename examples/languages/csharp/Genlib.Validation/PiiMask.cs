// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// Display masking of personal data for logs and UIs (not anonymization): e-mail addresses, phone numbers, card numbers, the
/// middle of any string, and free-text redaction of e-mails and Luhn-valid card numbers. E-mail and middle masking count code
/// points. Invalid input throws <see cref="ArgumentException"/>.
/// </summary>
public static class PiiMask {
    private static readonly Regex Email = new(@"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", RegexOptions.CultureInvariant);
    private static readonly Regex Card = new(@"(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])", RegexOptions.CultureInvariant);
    private static readonly Regex CardChars = new(@"\A[0-9 -]+\z", RegexOptions.CultureInvariant);
    private static readonly Regex CountryCode = new(@"\A\+(\d{1,3}) ", RegexOptions.CultureInvariant);

    /// <summary>Keeps the first code point of the local part and the domain: 'jane.doe@example.com' -> 'j*******@example.com' (at least 3 '*').</summary>
    public static string MaskEmail(string email) {
        ArgumentNullException.ThrowIfNull(email);
        int at = email.IndexOf('@');
        if (at < 0 || email.IndexOf('@', at + 1) >= 0) throw new ArgumentException("not an email address", nameof(email));
        var local = CodePoints(email[..at]);
        string domain = email[(at + 1)..];
        if (local.Count == 0 || domain.Length == 0) throw new ArgumentException("not an email address", nameof(email));
        return local[0] + new string('*', Math.Max(3, local.Count - 1)) + "@" + domain;
    }

    /// <summary>Masks every ASCII digit except the last 4 and a leading '+CC ' country code: '+1 (415) 555-0123' -> '+1 (***) ***-0123'; needs 7+ digits.</summary>
    public static string MaskPhone(string phone) {
        ArgumentNullException.ThrowIfNull(phone);
        int total = phone.Count(char.IsAsciiDigit);
        if (total < 7) throw new ArgumentException("not a phone number", nameof(phone));
        var m = CountryCode.Match(phone);
        int keepFront = m.Success ? m.Groups[1].Length : 0;
        var sb = new StringBuilder(phone.Length);
        int seen = 0;
        foreach (char c in phone) {
            if (char.IsAsciiDigit(c)) {
                bool keep = seen < keepFront || seen >= total - 4;
                sb.Append(keep ? c : '*');
                seen++;
            } else sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>Masks all but the last 4 digits, keeping spaces and hyphens: '4111 1111 1111 1111' -> '**** **** **** 1111'; needs 12-19 digits.</summary>
    public static string MaskCard(string card) {
        ArgumentNullException.ThrowIfNull(card);
        if (!CardChars.IsMatch(card)) throw new ArgumentException("not a card number", nameof(card));
        int total = card.Count(char.IsAsciiDigit);
        if (total < 12 || total > 19) throw new ArgumentException("not a card number", nameof(card));
        var sb = new StringBuilder(card.Length);
        int seen = 0;
        foreach (char c in card) {
            if (char.IsAsciiDigit(c)) { sb.Append(seen >= total - 4 ? c : '*'); seen++; }
            else sb.Append(c);
        }
        return sb.ToString();
    }

    /// <summary>Keeps <paramref name="keepStart"/> and <paramref name="keepEnd"/> code points and masks the rest (everything when the string is that short); the mask is one code point.</summary>
    public static string MaskMiddle(string s, int keepStart = 1, int keepEnd = 1, string mask = "*") {
        ArgumentNullException.ThrowIfNull(s);
        ArgumentNullException.ThrowIfNull(mask);
        if (keepStart < 0 || keepEnd < 0 || CodePoints(mask).Count != 1) throw new ArgumentException("bad arguments");
        var cps = CodePoints(s);
        var sb = new StringBuilder();
        if (cps.Count <= keepStart + keepEnd) {
            for (int i = 0; i < cps.Count; i++) sb.Append(mask);
            return sb.ToString();
        }
        for (int i = 0; i < cps.Count; i++) sb.Append(i < keepStart || i >= cps.Count - keepEnd ? cps[i] : mask);
        return sb.ToString();
    }

    /// <summary>Replaces Luhn-valid card numbers (13-19 digits, single space or hyphen separators) and then e-mail addresses in free text; kinds are "email" and "card".</summary>
    public static string Redact(string text, IEnumerable<string>? kinds = null) {
        ArgumentNullException.ThrowIfNull(text);
        var list = (kinds ?? new[] { "email", "card" }).ToList();
        foreach (var k in list) if (k != "email" && k != "card") throw new ArgumentException("unsupported kind", nameof(kinds));
        if (list.Contains("card")) {
            text = Card.Replace(text, m => Luhn(m.Value.Replace(" ", "").Replace("-", "")) ? MaskCard(m.Value) : m.Value);
        }
        if (list.Contains("email")) text = Email.Replace(text, m => MaskEmail(m.Value));
        return text;
    }

    private static bool Luhn(string digits) {
        int sum = 0;
        for (int i = 0; i < digits.Length; i++) {
            int n = digits[digits.Length - 1 - i] - '0';
            if (i % 2 == 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
            sum += n;
        }
        return sum % 10 == 0;
    }

    // Code points as strings; a lone surrogate counts as one code point.
    private static List<string> CodePoints(string s) {
        var list = new List<string>(s.Length);
        for (int i = 0; i < s.Length; i++) {
            if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { list.Add(s.Substring(i, 2)); i++; }
            else list.Add(s[i].ToString());
        }
        return list;
    }
}
