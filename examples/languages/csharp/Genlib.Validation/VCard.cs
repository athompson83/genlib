// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Structured name (N): family; given; additional; prefix; suffix.</summary>
public sealed record VCardName(string? Family = null, string? Given = null, string? Additional = null, string? Prefix = null, string? Suffix = null);

/// <summary>An EMAIL or TEL value with an optional lowercase TYPE parameter such as "work" or "cell".</summary>
public sealed record VCardTypedValue(string Value, string? Type = null);

/// <summary>Delivery address (ADR) with an optional TYPE parameter.</summary>
public sealed record VCardAddress(string? Type = null, string? PoBox = null, string? Extended = null, string? Street = null,
    string? Locality = null, string? Region = null, string? PostalCode = null, string? Country = null);

/// <summary>Contact fields for <see cref="VCard.BuildVcard"/>; only <see cref="Fn"/> is required.</summary>
public sealed record VCardContact(string Fn) {
    public VCardName? N { get; init; }
    public string? Org { get; init; }
    public string? Title { get; init; }
    public IReadOnlyList<VCardTypedValue> Emails { get; init; } = Array.Empty<VCardTypedValue>();
    public IReadOnlyList<VCardTypedValue> Phones { get; init; } = Array.Empty<VCardTypedValue>();
    public VCardAddress? Address { get; init; }
    public IReadOnlyList<string> Urls { get; init; } = Array.Empty<string>();
    public string? Note { get; init; }
    public string? Uid { get; init; }
}

/// <summary>RFC 6350 vCard 4.0 export with TEXT escaping and 75-octet UTF-8-safe line folding.</summary>
public static class VCard {
    private static readonly Regex Control = new(@"[\x00-\x09\x0b-\x1f\x7f]", RegexOptions.CultureInvariant);
    private static readonly Regex TypeParam = new(@"\A[a-z][a-z0-9-]*\z", RegexOptions.CultureInvariant);
    private static readonly Regex Email = new(@"\A[^\s@]+@[^\s@]+\z", RegexOptions.CultureInvariant);
    private static readonly Regex Phone = new(@"\A\+?[0-9][0-9 ().-]{1,30}\z", RegexOptions.CultureInvariant);
    private static readonly Regex Url = new(@"\Ahttps?://\S+\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Builds a vCard with CRLF line endings in the order BEGIN, VERSION, FN, N, ORG, TITLE, EMAIL, TEL, ADR, URL, NOTE, UID, END.
    /// Throws <see cref="ArgumentException"/> for a blank FN, a control character other than newline in a text value, an invalid
    /// TYPE, email, phone or http(s) URL.
    /// </summary>
    public static string BuildVcard(VCardContact c) {
        if (string.IsNullOrWhiteSpace(c.Fn)) throw new ArgumentException("fn is required", nameof(c));
        var lines = new List<string> { "BEGIN:VCARD", "VERSION:4.0", "FN:" + Escape(c.Fn) };
        if (c.N is { } n) lines.Add("N:" + string.Join(";", new[] { n.Family, n.Given, n.Additional, n.Prefix, n.Suffix }.Select(Escape)));
        if (!string.IsNullOrEmpty(c.Org)) lines.Add("ORG:" + Escape(c.Org));
        if (!string.IsNullOrEmpty(c.Title)) lines.Add("TITLE:" + Escape(c.Title));
        foreach (var e in c.Emails) {
            if (!Email.IsMatch(e.Value)) throw new ArgumentException("invalid email: " + e.Value, nameof(c));
            lines.Add("EMAIL" + TypeParameter(e.Type) + ":" + Escape(e.Value));
        }
        foreach (var p in c.Phones) {
            if (!Phone.IsMatch(p.Value)) throw new ArgumentException("invalid phone: " + p.Value, nameof(c));
            lines.Add("TEL" + TypeParameter(p.Type) + ":" + p.Value);
        }
        if (c.Address is { } a)
            lines.Add("ADR" + TypeParameter(a.Type) + ":" + string.Join(";", new[] { a.PoBox, a.Extended, a.Street, a.Locality, a.Region, a.PostalCode, a.Country }.Select(Escape)));
        foreach (var u in c.Urls) {
            if (!Url.IsMatch(u)) throw new ArgumentException("URL must be http(s): " + u, nameof(c));
            lines.Add("URL:" + u);
        }
        if (!string.IsNullOrEmpty(c.Note)) lines.Add("NOTE:" + Escape(c.Note));
        if (!string.IsNullOrEmpty(c.Uid)) lines.Add("UID:" + Escape(c.Uid));
        lines.Add("END:VCARD");
        var sb = new StringBuilder();
        foreach (var line in lines) Fold(sb, line);
        return sb.ToString();
    }

    /// <summary>Escapes a TEXT value: backslash, comma, semicolon and newline; other control characters are rejected.</summary>
    public static string Escape(string? value) {
        if (value is null) return "";
        if (Control.IsMatch(value)) throw new ArgumentException("control characters are not allowed in vCard text", nameof(value));
        return value.Replace("\\", "\\\\").Replace(",", "\\,").Replace(";", "\\;").Replace("\n", "\\n");
    }

    private static string TypeParameter(string? type) {
        if (type is null) return "";
        if (!TypeParam.IsMatch(type)) throw new ArgumentException("TYPE must match [a-z][a-z0-9-]*: " + type, nameof(type));
        return ";TYPE=" + type;
    }

    private static void Fold(StringBuilder sb, string line) {
        int limit = 75, used = 0;
        foreach (var rune in line.EnumerateRunes()) {
            int octets = rune.Utf8SequenceLength;
            if (used + octets > limit) { sb.Append("\r\n "); used = 0; limit = 74; }
            sb.Append(rune.ToString());
            used += octets;
        }
        sb.Append("\r\n");
    }
}
