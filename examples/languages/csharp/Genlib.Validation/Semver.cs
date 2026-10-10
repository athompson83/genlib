// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>A parsed SemVer 2.0.0 version. Build metadata is kept but ignored by comparison.</summary>
public sealed record SemVersion(long Major, long Minor, long Patch, IReadOnlyList<string> Prerelease, IReadOnlyList<string> Build) {
    public override string ToString() =>
        $"{Major}.{Minor}.{Patch}" + (Prerelease.Count > 0 ? "-" + string.Join(".", Prerelease) : "") + (Build.Count > 0 ? "+" + string.Join(".", Build) : "");
}

/// <summary>Strict SemVer 2.0.0 parsing and precedence, plus npm node-semver style range matching.</summary>
public static class Semver {
    private const string Num = "0|[1-9][0-9]*";
    private const string PreId = "(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)";
    private const string Pre = "(?:-(" + PreId + @"(?:\." + PreId + ")*))?";
    private const string BuildPart = @"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?";
    private static readonly Regex Full = new("^(" + Num + @")\.(" + Num + @")\.(" + Num + ")" + Pre + BuildPart + "$", RegexOptions.CultureInvariant);
    private static readonly Regex Partial = new("^v?(" + Num + "|[xX*])(?:\\.(" + Num + "|[xX*])(?:\\.(" + Num + "|[xX*])" + Pre + BuildPart + ")?)?$", RegexOptions.CultureInvariant);
    private static readonly Regex Hyphen = new(@"^(\S+)\s+-\s+(\S+)$", RegexOptions.CultureInvariant);
    private static readonly Regex OpSpace = new(@"(<=|>=|<|>|=|\^|~>|~)\s+", RegexOptions.CultureInvariant);
    private static readonly Regex Token = new("^(<=|>=|<|>|=|\\^|~>|~)?(.+)$", RegexOptions.CultureInvariant);

    /// <summary>Parses a strict SemVer 2.0.0 string; throws <see cref="FormatException"/> when invalid.</summary>
    public static SemVersion Parse(string text) {
        ArgumentNullException.ThrowIfNull(text);
        Match m = Full.Match(text);
        if (!m.Success) throw new FormatException("invalid semantic version: " + text);
        return new SemVersion(Number(m.Groups[1].Value), Number(m.Groups[2].Value), Number(m.Groups[3].Value),
            Split(m.Groups[4]), Split(m.Groups[5]));
    }

    /// <summary>Precedence per SemVer 2.0.0 section 11; returns -1, 0 or 1.</summary>
    public static int Compare(SemVersion a, SemVersion b) {
        int c = a.Major.CompareTo(b.Major);
        if (c == 0) c = a.Minor.CompareTo(b.Minor);
        if (c == 0) c = a.Patch.CompareTo(b.Patch);
        if (c != 0) return Math.Sign(c);
        if (a.Prerelease.Count == 0 || b.Prerelease.Count == 0) return (b.Prerelease.Count == 0 ? 0 : 1) - (a.Prerelease.Count == 0 ? 0 : 1);
        for (int i = 0; i < Math.Min(a.Prerelease.Count, b.Prerelease.Count); i++) {
            c = CompareIdentifier(a.Prerelease[i], b.Prerelease[i]);
            if (c != 0) return c;
        }
        return Math.Sign(a.Prerelease.Count.CompareTo(b.Prerelease.Count));
    }

    /// <summary>Parses both strings and compares them.</summary>
    public static int Compare(string a, string b) => Compare(Parse(a), Parse(b));

    /// <summary>True when <paramref name="version"/> satisfies the npm-style <paramref name="range"/>; throws <see cref="FormatException"/> for invalid input.</summary>
    public static bool Satisfies(string version, string range) {
        SemVersion v = Parse(version);
        ArgumentNullException.ThrowIfNull(range);
        foreach (string rawSet in range.Split("||")) {
            var set = ParseSet(rawSet.Trim());
            if (!set.All(c => Test(c, v))) continue;
            if (v.Prerelease.Count == 0) return true;
            if (set.Any(c => !c.Synthetic && c.Version.Prerelease.Count > 0
                && c.Version.Major == v.Major && c.Version.Minor == v.Minor && c.Version.Patch == v.Patch)) return true;
        }
        return false;
    }

    private readonly record struct Comparator(string Op, SemVersion Version, bool Synthetic);
    private sealed record PartialVersion(long? Major, long? Minor, long? Patch, IReadOnlyList<string> Prerelease);

    private static List<Comparator> ParseSet(string set) {
        var result = new List<Comparator>();
        if (set.Length == 0) return result; // empty set matches every release
        Match h = Hyphen.Match(set);
        if (h.Success) {
            PartialVersion from = ParsePartial(h.Groups[1].Value), to = ParsePartial(h.Groups[2].Value);
            if (from.Major is not null) result.Add(new(">=", Floor(from), false));
            if (to.Major is not null) {
                if (to.Minor is null) result.Add(Upper(Inc(to.Major.Value), 0, 0));
                else if (to.Patch is null) result.Add(Upper(to.Major.Value, Inc(to.Minor.Value), 0));
                else result.Add(new("<=", Floor(to), false));
            }
            return result;
        }
        foreach (string token in OpSpace.Replace(set, "$1").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)) {
            Match t = Token.Match(token);
            string op = t.Groups[1].Value;
            PartialVersion p = ParsePartial(t.Groups[2].Value);
            switch (op) {
                case "^": Caret(p, result); break;
                case "~": case "~>": Tilde(p, result); break;
                default: XRange(op, p, result); break;
            }
        }
        return result;
    }

    private static void Caret(PartialVersion p, List<Comparator> r) {
        if (p.Major is not long M) return;
        if (p.Minor is not long m) { r.Add(new(">=", Ver(M, 0, 0), false)); r.Add(Upper(Inc(M), 0, 0)); return; }
        if (p.Patch is not long pa) {
            r.Add(new(">=", Ver(M, m, 0), false));
            r.Add(M == 0 ? Upper(0, Inc(m), 0) : Upper(Inc(M), 0, 0));
            return;
        }
        r.Add(new(">=", Floor(p), false));
        r.Add(M != 0 ? Upper(Inc(M), 0, 0) : m != 0 ? Upper(0, Inc(m), 0) : Upper(0, 0, Inc(pa)));
    }

    private static void Tilde(PartialVersion p, List<Comparator> r) {
        if (p.Major is not long M) return;
        if (p.Minor is not long m) { r.Add(new(">=", Ver(M, 0, 0), false)); r.Add(Upper(Inc(M), 0, 0)); return; }
        r.Add(new(">=", Floor(p), false));
        r.Add(Upper(M, Inc(m), 0));
    }

    private static void XRange(string op, PartialVersion p, List<Comparator> r) {
        if (op == "") op = "=";
        if (p.Major is not long M) {
            if (op is "<" or ">") r.Add(new("<", Ver(0, 0, 0, "0"), true)); // matches nothing
            return;
        }
        if (p.Minor is not null && p.Patch is not null) { r.Add(new(op, Floor(p), false)); return; }
        long m = p.Minor ?? 0;
        bool minorX = p.Minor is null;
        switch (op) {
            case "=":
                r.Add(new(">=", Ver(M, m, 0), false));
                r.Add(minorX ? Upper(Inc(M), 0, 0) : Upper(M, Inc(m), 0));
                break;
            case ">": r.Add(new(">=", minorX ? Ver(Inc(M), 0, 0) : Ver(M, Inc(m), 0), false)); break;
            case ">=": r.Add(new(">=", Ver(M, m, 0), false)); break;
            case "<": r.Add(new("<", Ver(M, m, 0, "0"), true)); break;
            case "<=": r.Add(minorX ? Upper(Inc(M), 0, 0) : Upper(M, Inc(m), 0)); break;
        }
    }

    private static long Inc(long n) => checked(n + 1);

    private static Comparator Upper(long major, long minor, long patch) => new("<", Ver(major, minor, patch, "0"), true);

    private static SemVersion Ver(long major, long minor, long patch, string? pre = null) =>
        new(major, minor, patch, pre is null ? Array.Empty<string>() : new[] { pre }, Array.Empty<string>());

    private static SemVersion Floor(PartialVersion p) => new(p.Major ?? 0, p.Minor ?? 0, p.Patch ?? 0, p.Prerelease, Array.Empty<string>());

    private static bool Test(Comparator c, SemVersion v) {
        int cmp = Compare(v, c.Version);
        return c.Op switch { "<" => cmp < 0, "<=" => cmp <= 0, ">" => cmp > 0, ">=" => cmp >= 0, _ => cmp == 0 };
    }

    private static PartialVersion ParsePartial(string text) {
        Match m = Partial.Match(text);
        if (!m.Success) throw new FormatException("invalid range version: " + text);
        long? major = Part(m.Groups[1]), minor = major is null ? null : Part(m.Groups[2]), patch = minor is null ? null : Part(m.Groups[3]);
        var pre = patch is null ? Array.Empty<string>() : Split(m.Groups[4]);
        return new PartialVersion(major, minor, patch, pre);
    }

    private static long? Part(Group g) => !g.Success || g.Value is "x" or "X" or "*" ? null : Number(g.Value);

    private static long Number(string digits) {
        if (!long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out long n)) throw new FormatException("version number too large: " + digits);
        return n;
    }

    private static string[] Split(Group g) => g.Success ? g.Value.Split('.') : Array.Empty<string>();

    private static int CompareIdentifier(string a, string b) {
        bool an = a.All(char.IsAsciiDigit), bn = b.All(char.IsAsciiDigit);
        if (an && bn) return a.Length != b.Length ? Math.Sign(a.Length - b.Length) : Math.Sign(string.CompareOrdinal(a, b));
        if (an != bn) return an ? -1 : 1;
        return Math.Sign(string.CompareOrdinal(a, b));
    }
}
