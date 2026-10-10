// SPDX-License-Identifier: Apache-2.0
using PdfSharp.Pdf;
using PdfSharp.Pdf.AcroForms;
using PdfSharp.Pdf.Advanced;
using PdfSharp.Pdf.IO;

namespace Genlib.Cookbook.PdfForms;

public enum FieldKind { Text, Checkbox, Radio, Choice, Other }

public sealed record FormField(string Name, FieldKind Kind, string? Value, IReadOnlyList<string> Options);

/// <summary>Thin AcroForm helpers over PDFsharp 6 (MIT): list and fill fields.</summary>
public static class PdfForms
{
    /// <summary>Lists terminal fields by fully qualified name (empty when there is no form).</summary>
    public static IReadOnlyList<FormField> ListFields(byte[] pdf)
    {
        using var doc = PdfReader.Open(new MemoryStream(pdf), PdfDocumentOpenMode.Import);
        var result = new List<FormField>();
        if (doc.AcroForm is null) return result;
        foreach (var (name, field) in Terminal(doc.AcroForm.Fields, ""))
            result.Add(Describe(name, field));
        return result;
    }

    private static IEnumerable<(string, PdfAcroField)> Terminal(PdfAcroField.PdfAcroFieldCollection fields, string prefix)
    {
        for (var i = 0; i < fields.Count; i++)
        {
            var f = fields[i];
            var name = string.IsNullOrEmpty(prefix) ? f.Name : $"{prefix}.{f.Name}";
            if (f.HasKids && f.Fields.Count > 0 && f.Fields[0].Elements.ContainsKey("/T"))
                foreach (var t in Terminal(f.Fields, name)) yield return t;
            else
                yield return (name, f);
        }
    }

    private static List<string> Options(PdfAcroField f)
    {
        var opts = new List<string>();
        var arr = f.Elements.GetArray("/Opt");
        if (arr is null) return opts;
        foreach (var item in arr.Elements)
        {
            var o = item is PdfReference r ? r.Value : item;
            if (o is PdfArray pair && pair.Elements.Count > 0) o = pair.Elements[0];
            if (o is PdfString s) opts.Add(s.Value);
        }
        return opts;
    }

    private static FormField Describe(string name, PdfAcroField f) => f switch
    {
        PdfTextField t => new(name, FieldKind.Text, t.Text, []),
        PdfCheckBoxField c => new(name, FieldKind.Checkbox, c.Checked ? c.CheckedName : "/Off", [c.CheckedName]),
        PdfRadioButtonField r => new(name, FieldKind.Radio, r.Value?.ToString(), []),
        PdfComboBoxField c => new(name, FieldKind.Choice, (c.Value as PdfString)?.Value, Options(c)),
        PdfListBoxField l => new(name, FieldKind.Choice, (l.Value as PdfString)?.Value, Options(l)),
        _ => new(name, FieldKind.Other, f.Value?.ToString(), []),
    };

    /// <summary>
    /// Fills fields by fully qualified name: strings for text/choice, bool for checkboxes.
    /// Unknown names or invalid options throw <see cref="ArgumentException"/> before saving.
    /// <paramref name="makeReadOnly"/> calls PDFsharp's Flatten, which marks fields
    /// read-only; it does not merge them into page content.
    /// </summary>
    public static byte[] Fill(byte[] pdf, IReadOnlyDictionary<string, object> values, bool makeReadOnly = false)
    {
        using var doc = PdfReader.Open(new MemoryStream(pdf), PdfDocumentOpenMode.Modify);
        var form = doc.AcroForm ?? throw new ArgumentException("document has no AcroForm");
        var byName = Terminal(form.Fields, "").ToDictionary(t => t.Item1, t => t.Item2);
        foreach (var (name, value) in values)
        {
            if (!byName.TryGetValue(name, out var f)) throw new ArgumentException($"unknown form field: {name}");
            switch (f)
            {
                case PdfCheckBoxField c:
                    c.Checked = value is bool b ? b : throw new ArgumentException($"{name} needs a bool");
                    break;
                case PdfComboBoxField or PdfListBoxField:
                    var s = value.ToString()!;
                    var opts = Options(f);
                    if (opts.Count > 0 && !opts.Contains(s)) throw new ArgumentException($"{s} is not an option of {name}");
                    f.Value = new PdfString(s);
                    break;
                case PdfTextField t:
                    t.Text = value.ToString() ?? "";
                    break;
                default:
                    throw new ArgumentException($"unsupported field type for {name}: {f.GetType().Name}");
            }
        }
        // Ask viewers to regenerate appearances for fields PDFsharp does not render.
        form.Elements.SetBoolean("/NeedAppearances", true);
        if (makeReadOnly) doc.Flatten();
        var output = new MemoryStream();
        doc.Save(output, false);
        return output.ToArray();
    }
}
