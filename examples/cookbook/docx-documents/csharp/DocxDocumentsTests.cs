// SPDX-License-Identifier: Apache-2.0
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using Xunit;

namespace Genlib.Cookbook.Docx;

public class DocxDocumentsTests
{
    [Fact]
    public void CreateReplaceExtract()
    {
        var created = DocxDocuments.CreateReport("Quarterly report", "Prepared for {{customer}}.",
            new[] { new[] { "Item", "Qty" }, new[] { "Widgets", "3" } });
        Assert.Equal((byte)'P', created[0]);
        Assert.Equal((byte)'K', created[1]);
        Assert.Contains("{{customer}}", DocxDocuments.ExtractText(created));

        var patched = DocxDocuments.ReplacePlaceholders(created,
            new Dictionary<string, string> { ["customer"] = "Ada <Lovelace> & Co" });
        var text = DocxDocuments.ExtractText(patched);
        Assert.Contains("Quarterly report", text);
        Assert.Contains("Prepared for Ada <Lovelace> & Co.", text);
        Assert.DoesNotContain("{{customer}}", text);
        Assert.Contains("Widgets\t3", text);
    }

    [Fact]
    public void PlaceholderSplitAcrossRuns()
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, DocumentFormat.OpenXml.WordprocessingDocumentType.Document))
        {
            doc.AddMainDocumentPart().Document = new Document(new Body(new Paragraph(
                new Run(new Text("Dear {{cus")), new Run(new Text("tomer")), new Run(new Text("}},")))));
        }
        var patched = DocxDocuments.ReplacePlaceholders(ms.ToArray(), new Dictionary<string, string> { ["customer"] = "Grace" });
        Assert.Contains("Dear Grace,", DocxDocuments.ExtractText(patched));
    }
}
