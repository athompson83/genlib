// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: create, patch and read DOCX files with DocumentFormat.OpenXml (MIT).
// Thin wrapper only: the Open XML SDK owns the package and XML (it escapes Text values).
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Genlib.Cookbook.Docx;

public static class DocxDocuments
{
    /// <summary>Create a DOCX with a heading, a paragraph and a table (first row = header).</summary>
    public static byte[] CreateReport(string title, string body, IReadOnlyList<IReadOnlyList<string>> rows)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            var styles = main.AddNewPart<StyleDefinitionsPart>();
            styles.Styles = new Styles(
                new Style(
                    new StyleName { Val = "heading 1" },
                    new StyleParagraphProperties(new OutlineLevel { Val = 0 }),
                    new StyleRunProperties(new Bold(), new FontSize { Val = "32" }))
                { Type = StyleValues.Paragraph, StyleId = "Heading1" });

            var table = new Table(new TableProperties(new TableBorders(
                new TopBorder { Val = BorderValues.Single, Size = 4 },
                new BottomBorder { Val = BorderValues.Single, Size = 4 },
                new LeftBorder { Val = BorderValues.Single, Size = 4 },
                new RightBorder { Val = BorderValues.Single, Size = 4 },
                new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
                new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 })));
            for (var r = 0; r < rows.Count; r++)
            {
                var row = new TableRow();
                foreach (var text in rows[r])
                {
                    var run = new Run(TextOf(text));
                    if (r == 0) run.PrependChild(new RunProperties(new Bold()));
                    row.Append(new TableCell(new Paragraph(run)));
                }
                table.Append(row);
            }

            main.Document = new Document(new Body(
                new Paragraph(new ParagraphProperties(new ParagraphStyleId { Val = "Heading1" }), new Run(TextOf(title))),
                new Paragraph(new Run(TextOf(body))),
                table));
        }
        return ms.ToArray();
    }

    private static Text TextOf(string value) => new(value) { Space = SpaceProcessingModeValues.Preserve };

    /// <summary>
    /// Replace <c>{{key}}</c> placeholders in body, table cells, headers and footers. A
    /// placeholder split across runs is merged into the paragraph's first text element.
    /// </summary>
    public static byte[] ReplacePlaceholders(byte[] docx, IReadOnlyDictionary<string, string> values)
    {
        using var ms = new MemoryStream();
        ms.Write(docx);
        using (var doc = WordprocessingDocument.Open(ms, isEditable: true))
        {
            var main = doc.MainDocumentPart ?? throw new InvalidDataException("missing main document part");
            var roots = new List<OpenXmlElement>();
            if (main.Document?.Body is { } bodyRoot) roots.Add(bodyRoot);
            roots.AddRange(main.HeaderParts.Select(h => (OpenXmlElement)h.Header!));
            roots.AddRange(main.FooterParts.Select(f => (OpenXmlElement)f.Footer!));
            foreach (var paragraph in roots.SelectMany(r => r.Descendants<Paragraph>()))
                Patch(paragraph, values);
        }
        return ms.ToArray();
    }

    private static string Apply(string text, IReadOnlyDictionary<string, string> values) =>
        values.Aggregate(text, (acc, kv) => acc.Replace("{{" + kv.Key + "}}", kv.Value, StringComparison.Ordinal));

    private static bool HasToken(string text, IReadOnlyDictionary<string, string> values) =>
        values.Keys.Any(k => text.Contains("{{" + k + "}}", StringComparison.Ordinal));

    private static void Patch(Paragraph paragraph, IReadOnlyDictionary<string, string> values)
    {
        // Only direct runs' text; nested paragraphs (text boxes) are visited on their own.
        var texts = paragraph.Elements<Run>().SelectMany(r => r.Elements<Text>()).ToList();
        if (texts.Count == 0 || !HasToken(string.Concat(texts.Select(t => t.Text)), values)) return;
        foreach (var t in texts.Where(t => HasToken(t.Text, values)))
        {
            t.Text = Apply(t.Text, values);
            t.Space = SpaceProcessingModeValues.Preserve;
        }
        var joined = string.Concat(texts.Select(t => t.Text));
        if (!HasToken(joined, values)) return;
        texts[0].Text = Apply(joined, values);
        texts[0].Space = SpaceProcessingModeValues.Preserve;
        foreach (var t in texts.Skip(1)) t.Text = string.Empty;
    }

    /// <summary>Plain text of the body: one line per paragraph, table cells tab-separated.</summary>
    public static string ExtractText(byte[] docx)
    {
        using var ms = new MemoryStream(docx, writable: false);
        using var doc = WordprocessingDocument.Open(ms, isEditable: false);
        var body = doc.MainDocumentPart?.Document?.Body;
        if (body is null) return string.Empty;
        var lines = new List<string>();
        foreach (var element in body.ChildElements)
        {
            switch (element)
            {
                case Paragraph p:
                    lines.Add(p.InnerText);
                    break;
                case Table t:
                    lines.AddRange(t.Elements<TableRow>().Select(row =>
                        string.Join("\t", row.Elements<TableCell>().Select(c => c.InnerText))));
                    break;
            }
        }
        return string.Join("\n", lines);
    }
}
