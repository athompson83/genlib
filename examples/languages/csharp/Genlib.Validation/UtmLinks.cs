// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>UTM campaign parameters. Null means absent.</summary>
public sealed record UtmParameters(
    string? Source = null, string? Medium = null, string? Campaign = null, string? Term = null, string? Content = null, string? Id = null) {
    /// <summary>The present parameters as (name without "utm_", value) in the order id, source, medium, campaign, term, content.</summary>
    public IReadOnlyList<KeyValuePair<string, string>> ToPairs() {
        var pairs = new List<KeyValuePair<string, string>>();
        foreach (var (key, value) in new[] { ("id", Id), ("source", Source), ("medium", Medium), ("campaign", Campaign), ("term", Term), ("content", Content) })
            if (value is not null) pairs.Add(KeyValuePair.Create(key, value));
        return pairs;
    }
}

/// <summary>Builds, parses and cleans campaign-tagged URLs without touching unrelated query parameters.</summary>
public static class UtmLinks {
    private static readonly HashSet<string> TrackingParams = new(StringComparer.Ordinal) {
        "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "igshid",
    };

    /// <summary>
    /// Appends utm_id, utm_source, utm_medium, utm_campaign, utm_term and utm_content (trimmed, lowercased, RFC 3986 encoded)
    /// after existing parameters; an existing utm_* of the same name is replaced in place. The fragment stays last.
    /// </summary>
    public static string BuildUtmUrl(string baseUrl, UtmParameters utm) {
        ArgumentNullException.ThrowIfNull(utm);
        if (!WebText.IsAbsoluteHttpUrl(baseUrl)) throw new ArgumentException($"baseUrl must be an absolute http(s) URL: '{baseUrl}'", nameof(baseUrl));
        string Required(string? v, string name) {
            string t = (v ?? "").Trim();
            if (t.Length == 0) throw new ArgumentException($"{name} is required", nameof(utm));
            return t.ToLowerInvariant();
        }
        static string? Optional(string? v) {
            string t = (v ?? "").Trim();
            return t.Length == 0 ? null : t.ToLowerInvariant();
        }
        var normalized = new UtmParameters(Required(utm.Source, "source"), Required(utm.Medium, "medium"), Required(utm.Campaign, "campaign"),
            Optional(utm.Term), Optional(utm.Content), Optional(utm.Id));

        var (head, query, fragment) = WebText.SplitUrl(baseUrl);
        var segments = (query ?? "").Split('&').Where(s => s.Length > 0).ToList();
        foreach (var (key, value) in normalized.ToPairs()) {
            string name = "utm_" + key;
            string segment = name + "=" + Totp.PercentEncode(value);
            int index = segments.FindIndex(s => WebText.ParamName(s) == name);
            if (index < 0) { segments.Add(segment); continue; }
            segments[index] = segment;
            for (int i = segments.Count - 1; i > index; i--) if (WebText.ParamName(segments[i]) == name) segments.RemoveAt(i);
        }
        return WebText.JoinUrl(head, segments, fragment);
    }

    /// <summary>Reads utm_* parameters (first occurrence wins, '+' is a space, percent-decoded).</summary>
    public static UtmParameters ParseUtm(string url) {
        if (!WebText.IsAbsoluteHttpUrl(url)) throw new ArgumentException($"url must be an absolute http(s) URL: '{url}'", nameof(url));
        var found = new Dictionary<string, string>(StringComparer.Ordinal);
        var (_, query, _) = WebText.SplitUrl(url);
        foreach (var segment in (query ?? "").Split('&')) {
            if (segment.Length == 0) continue;
            int eq = segment.IndexOf('=');
            string name = WebText.FormDecode(eq < 0 ? segment : segment[..eq]);
            if (!name.StartsWith("utm_", StringComparison.Ordinal)) continue;
            string key = name[4..];
            if (key is not ("id" or "source" or "medium" or "campaign" or "term" or "content") || found.ContainsKey(key)) continue;
            found[key] = WebText.FormDecode(eq < 0 ? "" : segment[(eq + 1)..]);
        }
        string? Get(string k) => found.TryGetValue(k, out var v) ? v : null;
        return new UtmParameters(Get("source"), Get("medium"), Get("campaign"), Get("term"), Get("content"), Get("id"));
    }

    /// <summary>Removes utm_* and known click identifiers, keeping other parameters (order and encoding) and the fragment.</summary>
    public static string StripTracking(string url) {
        if (!WebText.IsAbsoluteHttpUrl(url)) throw new ArgumentException($"url must be an absolute http(s) URL: '{url}'", nameof(url));
        var (head, query, fragment) = WebText.SplitUrl(url);
        var kept = (query ?? "").Split('&').Where(s => {
            if (s.Length == 0) return false;
            string name = WebText.ParamName(s);
            return !name.StartsWith("utm_", StringComparison.Ordinal) && !TrackingParams.Contains(name);
        }).ToList();
        return WebText.JoinUrl(head, kept, fragment);
    }
}
