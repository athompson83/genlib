// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with
// HtmlSanitizer by mganss (MIT, AngleSharp parser).
using AngleSharp.Html.Dom;
using Ganss.Xss;

namespace Genlib.Cookbook.Sanitize;

public static class EditorHtmlSanitizer
{
    // Configured once and then only read; Sanitize may be called concurrently.
    private static readonly HtmlSanitizer Sanitizer = Create();

    private static HtmlSanitizer Create()
    {
        var sanitizer = new HtmlSanitizer(new HtmlSanitizerOptions
        {
            AllowedTags = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
                "ul", "ol", "li", "h1", "h2", "h3", "a",
            },
            // No style, class, id or on* handlers anywhere; no CSS at all.
            AllowedAttributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "href" },
            UriAttributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "href" },
            AllowedSchemes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "http", "https", "mailto" },
            AllowedCssProperties = new HashSet<string>(),
            AllowedAtRules = new HashSet<AngleSharp.Css.Dom.CssRuleType>(),
        });
        sanitizer.PostProcessNode += (_, e) =>
        {
            if (e.Node is IHtmlAnchorElement anchor)
            {
                anchor.SetAttribute("rel", "noopener noreferrer nofollow");
            }
        };
        return sanitizer;
    }

    /// <summary>Return HTML containing only allowlisted formatting and safe links.</summary>
    public static string Sanitize(string dirty) => Sanitizer.Sanitize(dirty);
}
