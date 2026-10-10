// SPDX-License-Identifier: Apache-2.0
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// WHATWG HTML "valid e-mail address" syntax checks. This is syntax only: proving that someone owns an address
/// still needs a confirmation email. Per WHATWG, <c>user.@example.com</c> and <c>a@b</c> are valid.
/// </summary>
public static class EmailAddress {
    private static readonly Regex Pattern = new(
        "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\\z",
        RegexOptions.CultureInvariant);
    private static readonly char[] AsciiWhitespace = { ' ', '\t', '\n', '\f', '\r' };

    /// <summary>True when <paramref name="s"/> is an ASCII WHATWG email of at most 254 characters with a local part of at most 64.</summary>
    public static bool EmailValid(string s) => s is not null && s.Length <= 254 && Pattern.IsMatch(s) && s.IndexOf('@') <= 64;

    /// <summary>Trims ASCII whitespace, validates and lowercases the domain (the local part keeps its case); throws <see cref="FormatException"/> when invalid.</summary>
    public static string EmailNormalize(string s) {
        ArgumentNullException.ThrowIfNull(s);
        string t = s.Trim(AsciiWhitespace);
        if (!EmailValid(t)) throw new FormatException("invalid email address");
        int at = t.IndexOf('@');
        return t[..(at + 1)] + t[(at + 1)..].ToLowerInvariant();
    }
}
