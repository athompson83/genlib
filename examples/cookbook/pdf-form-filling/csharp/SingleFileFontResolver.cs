// SPDX-License-Identifier: Apache-2.0
using PdfSharp.Fonts;

namespace Genlib.Cookbook.PdfForms;

/// <summary>
/// PDFsharp 6 (Core build) has no system font lookup on Linux/macOS and throws
/// when a text field needs a font. This resolver maps every family to one TTF
/// file you ship or trust. Assign once at startup, before any PDFsharp use:
/// <c>GlobalFontSettings.FontResolver = new SingleFileFontResolver(path);</c>
/// </summary>
public sealed class SingleFileFontResolver(string ttfPath) : IFontResolver
{
    private readonly byte[] _font = File.ReadAllBytes(ttfPath);

    public FontResolverInfo ResolveTypeface(string familyName, bool isBold, bool isItalic) =>
        new("single-face", isBold, isItalic);

    public byte[] GetFont(string faceName) => _font;
}
