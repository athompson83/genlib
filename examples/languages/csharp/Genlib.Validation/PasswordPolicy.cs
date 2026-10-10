// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>Policy options. Use a large breached-password list as <see cref="Blocklist"/> and the user's name, email and
/// the site name as <see cref="Context"/>.</summary>
public sealed record PasswordOptions {
    public int MinLength { get; init; } = 15;
    public int MaxLength { get; init; } = 64;
    public IReadOnlyList<string> Blocklist { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> Context { get; init; } = Array.Empty<string>();
}

/// <summary>Check result; failures are in the order too-short, too-long, control-characters, blocklisted, contains-context, repetitive.</summary>
public sealed record PasswordResult(bool Ok, IReadOnlyList<string> Failures);

/// <summary>
/// NIST SP 800-63B style password checks with no composition rules. Allow every printable character including spaces and
/// emoji, never truncate, hash with a slow password hash and rate-limit attempts; this check is not a substitute for those.
/// </summary>
public static class PasswordPolicy {
    private const string Alnum = "0123456789abcdefghijklmnopqrstuvwxyz";

    /// <summary>Checks a password (lengths in Unicode code points). Throws <see cref="ArgumentException"/> when MinLength &lt; 1
    /// or MaxLength &lt; MinLength.</summary>
    public static PasswordResult CheckPassword(string password, PasswordOptions? options = null) {
        var o = options ?? new PasswordOptions();
        if (o.MinLength < 1 || o.MaxLength < o.MinLength) throw new ArgumentException("require 1 <= minLength <= maxLength", nameof(options));
        int[] cps = CodePoints(password);
        var fails = new List<string>();
        if (cps.Length < o.MinLength) fails.Add("too-short");
        if (cps.Length > o.MaxLength) fails.Add("too-long");
        if (cps.Any(c => c < 0x20 || (c >= 0x7F && c <= 0x9F))) fails.Add("control-characters");
        string low = AsciiLower(password);
        if (o.Blocklist.Any(b => AsciiLower(b) == low)) fails.Add("blocklisted");
        if (o.Context.Any(c => CodePoints(c).Length >= 4 && low.Contains(AsciiLower(c), StringComparison.Ordinal))) fails.Add("contains-context");
        if (IsRepetitive(cps)) fails.Add("repetitive");
        return new PasswordResult(fails.Count == 0, fails);
    }

    private static bool IsRepetitive(int[] cps) {
        for (int i = 0; i + 3 < cps.Length; i++) {
            if (cps[i] == cps[i + 1] && cps[i] == cps[i + 2] && cps[i] == cps[i + 3]) return true;
            var w = new StringBuilder(4);
            bool alnum = true;
            for (int k = i; k < i + 4; k++) {
                int c = cps[k] is >= 'A' and <= 'Z' ? cps[k] + 32 : cps[k];
                if (c > 0x7F || Alnum.IndexOf((char)c) < 0) { alnum = false; break; }
                w.Append((char)c);
            }
            if (!alnum) continue;
            string fwd = w.ToString(), rev = new string(fwd.Reverse().ToArray());
            if (Alnum.Contains(fwd, StringComparison.Ordinal) || Alnum.Contains(rev, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    private static string AsciiLower(string s) {
        var chars = s.ToCharArray();
        for (int i = 0; i < chars.Length; i++) if (chars[i] is >= 'A' and <= 'Z') chars[i] = (char)(chars[i] + 32);
        return new string(chars);
    }

    private static int[] CodePoints(string s) {
        var list = new List<int>(s.Length);
        for (int i = 0; i < s.Length; i++) {
            if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { list.Add(char.ConvertToUtf32(s[i], s[i + 1])); i++; }
            else list.Add(s[i]);
        }
        return list.ToArray();
    }
}
