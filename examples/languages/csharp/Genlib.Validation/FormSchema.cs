// SPDX-License-Identifier: Apache-2.0
using System.Text.RegularExpressions;

namespace Genlib.Validation;

public enum FieldType { String, Number, Integer, Boolean, Email, Date }

public sealed record FormField(string Name, FieldType Type, bool Required = false, int? MinLength = null, int? MaxLength = null,
    double? Min = null, double? Max = null, string? Pattern = null, IReadOnlyList<string>? Enum = null);

public sealed record FieldErrors(string Field, IReadOnlyList<string> Codes);

/// <summary>Server-side form validation returning ordered error codes per field.</summary>
public static class FormSchema {
    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(250);

    /// <summary>
    /// Validates <paramref name="values"/> (enumerated in input order) against the ordered schema.
    /// Missing, null and empty-string values of optional fields are treated as absent.
    /// </summary>
    public static IReadOnlyList<FieldErrors> Validate(IReadOnlyList<FormField> schema, IEnumerable<KeyValuePair<string, object?>> values, bool allowUnknown = false) {
        ArgumentNullException.ThrowIfNull(schema); ArgumentNullException.ThrowIfNull(values);
        var input = new Dictionary<string, object?>();
        var order = new List<string>();
        foreach (var kv in values) { if (input.TryAdd(kv.Key, kv.Value)) order.Add(kv.Key); else throw new ArgumentException($"duplicate key '{kv.Key}'"); }
        var names = new HashSet<string>();
        var result = new List<FieldErrors>();
        foreach (var field in schema) {
            if (!names.Add(field.Name)) throw new ArgumentException($"duplicate schema field '{field.Name}'");
            var codes = CheckField(field, input.TryGetValue(field.Name, out var v) ? v : null);
            if (codes.Count > 0) result.Add(new FieldErrors(field.Name, codes));
        }
        if (!allowUnknown)
            foreach (var key in order) if (!names.Contains(key)) result.Add(new FieldErrors(key, new[] { "unknown" }));
        return result;
    }

    private static List<string> CheckField(FormField f, object? value) {
        var codes = new List<string>();
        if (value is null || value is string { Length: 0 }) { if (f.Required) codes.Add("required"); return codes; }
        bool isStringType = f.Type is FieldType.String or FieldType.Email or FieldType.Date;
        double? number = ToNumber(value);
        bool typeOk = f.Type switch {
            FieldType.Boolean => value is bool,
            FieldType.Number => number is double n && double.IsFinite(n),
            FieldType.Integer => number is double m && double.IsFinite(m) && Math.Floor(m) == m,
            _ => value is string,
        };
        if (!typeOk) { codes.Add("type"); return codes; }
        if (isStringType) {
            var s = (string)value;
            int length = s.EnumerateRunes().Count();
            if (f.MinLength is int min && length < min) codes.Add("minLength");
            if (f.MaxLength is int max && length > max) codes.Add("maxLength");
            if (f.Pattern is not null && !Regex.IsMatch(s, $"^(?:{f.Pattern})\\z", RegexOptions.CultureInvariant, RegexTimeout)) codes.Add("pattern");
            if (f.Enum is not null && !f.Enum.Contains(s)) codes.Add("enum");
            if (f.Type == FieldType.Email && !IsEmail(s)) codes.Add("email");
            if (f.Type == FieldType.Date && !IsDate(s)) codes.Add("date");
        } else if (number is double d) {
            if (f.Min is double lo && d < lo) codes.Add("min");
            if (f.Max is double hi && d > hi) codes.Add("max");
        }
        return codes;
    }

    private static double? ToNumber(object value) => value switch {
        bool => null,
        byte or sbyte or short or ushort or int or uint or long or ulong => Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture),
        float f => f, double d => d, decimal m => (double)m,
        _ => null,
    };

    private static bool IsEmail(string s) {
        if (s.Length > 254 || s.Any(char.IsWhiteSpace)) return false;
        int at = s.IndexOf('@');
        if (at <= 0 || at != s.LastIndexOf('@')) return false;
        return s[(at + 1)..].Contains('.');
    }

    private static bool IsDate(string s) {
        if (s.Length != 10 || s[4] != '-' || s[7] != '-') return false;
        for (int i = 0; i < 10; i++) if (i != 4 && i != 7 && !char.IsAsciiDigit(s[i])) return false;
        int year = int.Parse(s[..4]), month = int.Parse(s[5..7]), day = int.Parse(s[8..]);
        if (month < 1 || month > 12 || day < 1) return false;
        bool leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        int[] days = { 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
        return day <= days[month - 1];
    }
}
