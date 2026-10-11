// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// HTML escaping for text and quoted attributes, unescaping of character references (decimal with 1-10 digits, hex with 1-8 digits,
/// ';' required; 0, surrogates and values above U+10FFFF become U+FFFD; 0x80-0x9F map through the HTML5 windows-1252 table; a fixed
/// set of case-sensitive named references), and tag stripping for plain-text previews.
/// </summary>
public static class HtmlEscape {
    private static readonly Dictionary<string, string> Named = new() {
        ["amp"] = "&", ["lt"] = "<", ["gt"] = ">", ["quot"] = "\"", ["apos"] = "'", ["nbsp"] = " ", ["copy"] = "©",
        ["reg"] = "®", ["trade"] = "™", ["hellip"] = "…", ["mdash"] = "—", ["ndash"] = "–",
        ["lsquo"] = "‘", ["rsquo"] = "’", ["ldquo"] = "“", ["rdquo"] = "”", ["bull"] = "•",
        ["middot"] = "·", ["deg"] = "°", ["plusmn"] = "±", ["times"] = "×", ["divide"] = "÷",
        ["euro"] = "€", ["pound"] = "£", ["yen"] = "¥", ["cent"] = "¢", ["sect"] = "§", ["para"] = "¶",
        ["laquo"] = "«", ["raquo"] = "»", ["iexcl"] = "¡", ["iquest"] = "¿", ["shy"] = "­",
    };
    private static readonly Dictionary<int, int> C1 = new() {
        [0x80] = 0x20AC, [0x82] = 0x201A, [0x83] = 0x0192, [0x84] = 0x201E, [0x85] = 0x2026, [0x86] = 0x2020, [0x87] = 0x2021,
        [0x88] = 0x02C6, [0x89] = 0x2030, [0x8A] = 0x0160, [0x8B] = 0x2039, [0x8C] = 0x0152, [0x8E] = 0x017D, [0x91] = 0x2018,
        [0x92] = 0x2019, [0x93] = 0x201C, [0x94] = 0x201D, [0x95] = 0x2022, [0x96] = 0x2013, [0x97] = 0x2014, [0x98] = 0x02DC,
        [0x99] = 0x2122, [0x9A] = 0x0161, [0x9B] = 0x203A, [0x9C] = 0x0153, [0x9E] = 0x017E, [0x9F] = 0x0178,
    };
    private static readonly Regex Reference = new(@"&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});", RegexOptions.CultureInvariant);
    private static readonly Regex ScriptStyle = new(@"<(script|style)\b[^>]*>.*?(</\1\s*>|$)", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.CultureInvariant);
    private static readonly Regex AnyTag = new(@"<[A-Za-z/!?][^>]*>", RegexOptions.CultureInvariant);

    /// <summary>Escapes &amp; &lt; &gt; " ' as &amp;amp; &amp;lt; &amp;gt; &amp;quot; &amp;#39; (safe in text and quoted attributes).</summary>
    public static string Escape(string s) {
        ArgumentNullException.ThrowIfNull(s);
        return s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&#39;");
    }

    /// <summary>Decodes numeric and the supported named character references; anything else (unknown names, missing ';') is left as is.</summary>
    public static string Unescape(string s) {
        ArgumentNullException.ThrowIfNull(s);
        return Reference.Replace(s, m => {
            string g = m.Groups[1].Value;
            if (g[0] == '#') {
                long v = g[1] == 'x' || g[1] == 'X'
                    ? long.Parse(g.AsSpan(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture)
                    : long.Parse(g.AsSpan(1), NumberStyles.None, CultureInfo.InvariantCulture);
                return FromNumber(Math.Min(v, 0x110000));
            }
            return Named.TryGetValue(g, out var r) ? r : m.Value;
        });
    }

    /// <summary>
    /// Plain text for previews: drops script/style elements with their content, removes tags, then unescapes. It is NOT a sanitizer;
    /// never render its output as HTML.
    /// </summary>
    public static string StripTags(string s) {
        ArgumentNullException.ThrowIfNull(s);
        s = ScriptStyle.Replace(s, "");
        s = AnyTag.Replace(s, "");
        return Unescape(s);
    }

    private static string FromNumber(long v) {
        if (v == 0 || (v >= 0xD800 && v <= 0xDFFF) || v > 0x10FFFF) return "�";
        int cp = C1.TryGetValue((int)v, out int mapped) ? mapped : (int)v;
        return char.ConvertFromUtf32(cp);
    }
}
