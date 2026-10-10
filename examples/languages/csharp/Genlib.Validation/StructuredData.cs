// SPDX-License-Identifier: Apache-2.0
using System.Collections;
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>Inputs for <see cref="StructuredData.MetaTags"/>. Null or empty optional values are omitted.</summary>
public sealed record MetaTagOptions(
    string Title, string? Description = null, string? Canonical = null, string? Image = null, string? SiteName = null,
    string Type = "website", string TwitterCard = "summary_large_image", string? Locale = null);

/// <summary>JSON-LD script elements and HTML meta / Open Graph / Twitter tags.</summary>
public static class StructuredData {
    private const int MaxDepth = 64;
    private static readonly string[] TwitterCards = { "summary", "summary_large_image", "app", "player" };

    /// <summary>
    /// Serializes a map (any <c>IEnumerable&lt;KeyValuePair&lt;string, object?&gt;&gt;</c>, in enumeration order) or a list to compact JSON
    /// inside <c>&lt;script type="application/ld+json"&gt;</c>, escaping &lt; &gt; &amp; U+2028 and U+2029 as \uXXXX.
    /// </summary>
    public static string JsonLdScript(object value) {
        ArgumentNullException.ThrowIfNull(value);
        if (value is string || !(value is IEnumerable)) throw new ArgumentException("JSON-LD root must be a map or a list", nameof(value));
        var sb = new StringBuilder("<script type=\"application/ld+json\">");
        WriteJson(sb, value, 0);
        return sb.Append("</script>").ToString();
    }

    /// <summary>Returns title, description, canonical, Open Graph and Twitter tags joined by "\n" (no trailing newline).</summary>
    public static string MetaTags(MetaTagOptions options) {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.Title)) throw new ArgumentException("title must not be empty", nameof(options));
        if (!string.IsNullOrEmpty(options.Canonical) && !WebText.IsAbsoluteHttpUrl(options.Canonical, httpsOnly: true))
            throw new ArgumentException($"canonical must be an absolute https URL: '{options.Canonical}'", nameof(options));
        if (!string.IsNullOrEmpty(options.Image) && !WebText.IsAbsoluteHttpUrl(options.Image, httpsOnly: true))
            throw new ArgumentException($"image must be an absolute https URL: '{options.Image}'", nameof(options));
        if (string.IsNullOrWhiteSpace(options.Type)) throw new ArgumentException("type must not be empty", nameof(options));
        if (Array.IndexOf(TwitterCards, options.TwitterCard) < 0)
            throw new ArgumentException($"twitterCard must be one of {string.Join(", ", TwitterCards)}", nameof(options));

        var lines = new List<string>();
        void Meta(string attr, string key, string? value) {
            if (!string.IsNullOrEmpty(value)) lines.Add($"<meta {attr}=\"{key}\" content=\"{WebText.HtmlEscape(value)}\">");
        }
        string title = WebText.HtmlEscape(options.Title);
        lines.Add($"<title>{title}</title>");
        Meta("name", "description", options.Description);
        if (!string.IsNullOrEmpty(options.Canonical)) lines.Add($"<link rel=\"canonical\" href=\"{WebText.HtmlEscape(options.Canonical)}\">");
        Meta("property", "og:title", options.Title);
        Meta("property", "og:description", options.Description);
        Meta("property", "og:url", options.Canonical);
        Meta("property", "og:image", options.Image);
        Meta("property", "og:site_name", options.SiteName);
        Meta("property", "og:type", options.Type);
        Meta("property", "og:locale", options.Locale);
        Meta("name", "twitter:card", options.TwitterCard);
        Meta("name", "twitter:title", options.Title);
        Meta("name", "twitter:description", options.Description);
        Meta("name", "twitter:image", options.Image);
        return string.Join("\n", lines);
    }

    private static void WriteJson(StringBuilder sb, object? value, int depth) {
        if (depth > MaxDepth) throw new ArgumentException($"JSON-LD nesting exceeds {MaxDepth} levels");
        switch (value) {
            case null: sb.Append("null"); break;
            case bool b: sb.Append(b ? "true" : "false"); break;
            case string s: WriteString(sb, s); break;
            case sbyte or byte or short or ushort or int or uint or long or ulong:
                sb.Append(Convert.ToString(value, CultureInfo.InvariantCulture)); break;
            case decimal m: sb.Append(m.ToString(CultureInfo.InvariantCulture)); break;
            case float f: WriteDouble(sb, f); break;
            case double d: WriteDouble(sb, d); break;
            case IEnumerable<KeyValuePair<string, object?>> map: {
                sb.Append('{');
                bool first = true;
                foreach (var pair in map) {
                    if (pair.Key is null) throw new ArgumentException("JSON-LD keys must not be null");
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, pair.Key);
                    sb.Append(':');
                    WriteJson(sb, pair.Value, depth + 1);
                }
                sb.Append('}');
                break;
            }
            case IDictionary dict: {
                sb.Append('{');
                bool first = true;
                foreach (DictionaryEntry entry in dict) {
                    if (entry.Key is not string key) throw new ArgumentException("JSON-LD keys must be strings");
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, key);
                    sb.Append(':');
                    WriteJson(sb, entry.Value, depth + 1);
                }
                sb.Append('}');
                break;
            }
            case IEnumerable list: {
                sb.Append('[');
                bool first = true;
                foreach (var item in list) {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteJson(sb, item, depth + 1);
                }
                sb.Append(']');
                break;
            }
            default: throw new ArgumentException($"unsupported JSON-LD value type {value.GetType().Name}");
        }
    }

    private static void WriteDouble(StringBuilder sb, double d) {
        if (double.IsNaN(d) || double.IsInfinity(d)) throw new ArgumentException("JSON-LD numbers must be finite");
        if (d == Math.Floor(d) && Math.Abs(d) < 1e15) sb.Append(((long)d).ToString(CultureInfo.InvariantCulture));
        else sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
    }

    private static void WriteString(StringBuilder sb, string s) {
        sb.Append('"');
        foreach (char c in s) {
            switch (c) {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                case '<' or '>' or '&' or (char)0x2028 or (char)0x2029:
                    sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture)); break;
                default:
                    if (c < ' ') sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }
}
