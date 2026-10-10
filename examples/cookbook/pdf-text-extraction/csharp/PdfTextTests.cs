// SPDX-License-Identifier: Apache-2.0
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;
using Xunit;

namespace Genlib.Cookbook.PdfText;

public class PdfTextTests
{
    /// <summary>Generates a two-page PDF with PdfPig's builder at test time.</summary>
    private static byte[] MakePdf()
    {
        var builder = new PdfDocumentBuilder();
        builder.DocumentInformation.Title = "Cookbook Fixture";
        builder.DocumentInformation.Author = "Genlib";
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        foreach (var text in new[] { "Hello from page one", "Second page text" })
        {
            var page = builder.AddPage(PageSize.A4);
            page.AddText(text, 14, new PdfPoint(72, 750), font);
        }
        return builder.Build();
    }

    [Fact]
    public void ExtractsPagesAndMetadata()
    {
        var r = PdfTextExtractor.Extract(MakePdf());
        Assert.Equal(2, r.Pages.Count);
        Assert.Contains("Hello from page one", r.Pages[0]);
        Assert.DoesNotContain("Second", r.Pages[0]);
        Assert.Contains("Second page text", r.Pages[1]);
        Assert.Equal("Cookbook Fixture", r.Metadata["title"]);
        Assert.Equal("Genlib", r.Metadata["author"]);
    }

    [Fact]
    public void RejectsGarbage()
    {
        Assert.ThrowsAny<Exception>(() => PdfTextExtractor.Extract("not a pdf"u8.ToArray()));
    }
}
