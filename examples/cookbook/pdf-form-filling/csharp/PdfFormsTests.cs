// SPDX-License-Identifier: Apache-2.0
using PdfSharp.Pdf;
using PdfSharp.Pdf.Advanced;
using Xunit;

namespace Genlib.Cookbook.PdfForms;

public class PdfFormsTests
{
    static PdfFormsTests()
    {
        // Any TrueType font works; these are common on Linux CI images.
        string[] candidates =
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/TTF/DejaVuSans.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
        ];
        var font = candidates.FirstOrDefault(File.Exists)
            ?? throw new InvalidOperationException("no TrueType font found for PDFsharp tests");
        PdfSharp.Fonts.GlobalFontSettings.FontResolver ??= new SingleFileFontResolver(font);
    }

    private static PdfArray Rect(PdfDocument d, double x, double y, double w, double h) =>
        new(d, new PdfReal(x), new PdfReal(y), new PdfReal(x + w), new PdfReal(y + h));

    /// <summary>Builds an AcroForm from PDFsharp's low-level objects at test time.</summary>
    private static byte[] MakeForm()
    {
        var doc = new PdfDocument();
        var page = doc.AddPage();
        var helv = new PdfDictionary(doc);
        helv.Elements.SetName("/Type", "/Font");
        helv.Elements.SetName("/Subtype", "/Type1");
        helv.Elements.SetName("/BaseFont", "/Helvetica");
        doc.Internals.AddObject(helv);

        PdfDictionary Widget(string ft, string name, PdfArray rect)
        {
            var w = new PdfDictionary(doc);
            w.Elements.SetName("/Type", "/Annot");
            w.Elements.SetName("/Subtype", "/Widget");
            w.Elements.SetName("/FT", ft);
            w.Elements.SetString("/T", name);
            w.Elements["/Rect"] = rect;
            w.Elements.SetReference("/P", page);
            w.Elements.SetString("/DA", "/Helv 12 Tf 0 g");
            doc.Internals.AddObject(w);
            return w;
        }

        var name = Widget("/Tx", "name", Rect(doc, 50, 700, 200, 20));
        var plan = Widget("/Ch", "plan", Rect(doc, 50, 620, 120, 20));
        plan.Elements.SetInteger("/Ff", 1 << 17); // combo box
        plan.Elements["/Opt"] = new PdfArray(doc, new PdfString("free"), new PdfString("pro"), new PdfString("team"));
        plan.Elements.SetString("/V", "free");

        var subscribe = Widget("/Btn", "subscribe", Rect(doc, 50, 660, 12, 12));
        PdfDictionary Box(string content)
        {
            var s = new PdfDictionary(doc);
            s.Elements.SetName("/Type", "/XObject");
            s.Elements.SetName("/Subtype", "/Form");
            s.Elements["/BBox"] = Rect(doc, 0, 0, 12, 12);
            s.CreateStream(System.Text.Encoding.ASCII.GetBytes(content));
            doc.Internals.AddObject(s);
            return s;
        }
        var normal = new PdfDictionary(doc);
        normal.Elements.SetReference("/Yes", Box("0 0 12 12 re f"));
        normal.Elements.SetReference("/Off", Box("0 0 12 12 re S"));
        var ap = new PdfDictionary(doc);
        ap.Elements["/N"] = normal;
        subscribe.Elements["/AP"] = ap;
        subscribe.Elements.SetName("/AS", "/Off");
        subscribe.Elements.SetName("/V", "/Off");

        var annots = new PdfArray(doc);
        var fields = new PdfArray(doc);
        foreach (var w in new[] { name, subscribe, plan })
        {
            annots.Elements.Add(w.Reference!);
            fields.Elements.Add(w.Reference!);
        }
        page.Elements["/Annots"] = annots;
        var form = new PdfDictionary(doc);
        form.Elements["/Fields"] = fields;
        form.Elements.SetString("/DA", "/Helv 12 Tf 0 g");
        var fonts = new PdfDictionary(doc);
        fonts.Elements.SetReference("/Helv", helv);
        var dr = new PdfDictionary(doc);
        dr.Elements["/Font"] = fonts;
        form.Elements["/DR"] = dr;
        doc.Internals.AddObject(form);
        doc.Internals.Catalog.Elements.SetReference("/AcroForm", form);

        var ms = new MemoryStream();
        doc.Save(ms, false);
        return ms.ToArray();
    }

    private static Dictionary<string, FormField> ByName(byte[] pdf) =>
        PdfForms.ListFields(pdf).ToDictionary(f => f.Name);

    [Fact]
    public void ListsFields()
    {
        var m = ByName(MakeForm());
        Assert.Equal(FieldKind.Text, m["name"].Kind);
        Assert.Equal(FieldKind.Checkbox, m["subscribe"].Kind);
        Assert.Equal(new[] { "free", "pro", "team" }, m["plan"].Options);
    }

    [Fact]
    public void FillsAndReadsBack()
    {
        var output = PdfForms.Fill(MakeForm(), new Dictionary<string, object>
        {
            ["name"] = "Ada Lovelace", ["subscribe"] = true, ["plan"] = "pro",
        });
        var m = ByName(output);
        Assert.Equal("Ada Lovelace", m["name"].Value);
        Assert.Equal("/Yes", m["subscribe"].Value);
        Assert.Equal("pro", m["plan"].Value);
    }

    [Fact]
    public void RejectsUnknownAndInvalid()
    {
        var src = MakeForm();
        Assert.Throws<ArgumentException>(() => PdfForms.Fill(src, new Dictionary<string, object> { ["nmae"] = "x" }));
        Assert.Throws<ArgumentException>(() => PdfForms.Fill(src, new Dictionary<string, object> { ["plan"] = "enterprise" }));
    }

    [Fact]
    public void MakeReadOnlySetsReadOnlyFlag()
    {
        var output = PdfForms.Fill(MakeForm(), new Dictionary<string, object> { ["plan"] = "team" }, makeReadOnly: true);
        using var doc = PdfSharp.Pdf.IO.PdfReader.Open(new MemoryStream(output), PdfSharp.Pdf.IO.PdfDocumentOpenMode.Import);
        Assert.True(doc.AcroForm!.Fields["plan"]!.ReadOnly);
    }
}
