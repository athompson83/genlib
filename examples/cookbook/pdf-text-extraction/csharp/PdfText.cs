// SPDX-License-Identifier: Apache-2.0
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace Genlib.Cookbook.PdfText;

public sealed record PdfTextResult(IReadOnlyList<string> Pages, IReadOnlyDictionary<string, string> Metadata);

/// <summary>Per-page text and Info metadata with PdfPig (Apache-2.0).</summary>
public static class PdfTextExtractor
{
    /// <summary>
    /// Extracts text page by page in content order. Image-only pages return ""
    /// (OCR is out of scope). Encrypted files need <c>ParsingOptions.Password</c>.
    /// </summary>
    public static PdfTextResult Extract(byte[] pdf)
    {
        using var doc = PdfDocument.Open(pdf);
        var pages = doc.GetPages().Select(p => ContentOrderTextExtractor.GetText(p)).ToList();
        var info = doc.Information;
        var meta = new Dictionary<string, string>();
        void Put(string key, string? value)
        {
            if (!string.IsNullOrEmpty(value)) meta[key] = value;
        }
        Put("title", info.Title);
        Put("author", info.Author);
        Put("subject", info.Subject);
        Put("creator", info.Creator);
        Put("producer", info.Producer);
        return new PdfTextResult(pages, meta);
    }
}
