// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// File type detection from leading bytes (magic numbers) for upload checks; the first matching rule wins. Detection is a first
/// check, not a malware scan: still re-encode or sandbox untrusted files.
/// </summary>
public static class FileSignature {
    private static readonly Dictionary<string, (string Mime, string Extension)> Ftyp = new() {
        ["avif"] = ("image/avif", "avif"), ["avis"] = ("image/avif", "avif"), ["heic"] = ("image/heic", "heic"), ["heix"] = ("image/heic", "heic"),
        ["mif1"] = ("image/heif", "heif"), ["msf1"] = ("image/heif", "heif"), ["qt  "] = ("video/quicktime", "mov"), ["M4A "] = ("audio/mp4", "m4a"),
        ["3gp4"] = ("video/3gpp", "3gp"), ["3gp5"] = ("video/3gpp", "3gp"),
    };
    private static readonly Dictionary<string, string> Aliases = new() {
        ["jpeg"] = "jpg", ["jpe"] = "jpg", ["tiff"] = "tif", ["htm"] = "html", ["mpeg"] = "mp3", ["heif"] = "heif",
    };
    private static readonly string[] ZipExtensions = { "zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub" };

    private static bool At(ReadOnlySpan<byte> b, int offset, ReadOnlySpan<byte> sig) =>
        b.Length >= offset + sig.Length && b.Slice(offset, sig.Length).SequenceEqual(sig);

    private static bool At(ReadOnlySpan<byte> b, int offset, string ascii) {
        if (b.Length < offset + ascii.Length) return false;
        for (int i = 0; i < ascii.Length; i++) if (b[offset + i] != ascii[i]) return false;
        return true;
    }

    /// <summary>(mime, extension) for a recognised format, else null. Reads at most the first 64 bytes.</summary>
    public static (string Mime, string Extension)? DetectFileType(ReadOnlySpan<byte> data) {
        var b = data.Length > 64 ? data[..64] : data;
        if (At(b, 0, "\x89PNG\r\n\x1a\n")) return ("image/png", "png");
        if (At(b, 0, "\xff\xd8\xff")) return ("image/jpeg", "jpg");
        if (At(b, 0, "GIF87a") || At(b, 0, "GIF89a")) return ("image/gif", "gif");
        if (At(b, 0, "RIFF") && At(b, 8, "WEBP")) return ("image/webp", "webp");
        if (At(b, 0, "RIFF") && At(b, 8, "WAVE")) return ("audio/wav", "wav");
        if (At(b, 0, "RIFF") && At(b, 8, "AVI ")) return ("video/x-msvideo", "avi");
        if (At(b, 0, "BM") && b.Length >= 14) return ("image/bmp", "bmp");
        if (At(b, 0, stackalloc byte[] { 0, 0, 1, 0 })) return ("image/x-icon", "ico");
        if (At(b, 0, stackalloc byte[] { (byte)'I', (byte)'I', (byte)'*', 0 }) || At(b, 0, stackalloc byte[] { (byte)'M', (byte)'M', 0, (byte)'*' })) return ("image/tiff", "tif");
        if (At(b, 0, "%PDF-")) return ("application/pdf", "pdf");
        if (At(b, 0, "PK\x03\x04") || At(b, 0, "PK\x05\x06")) return ("application/zip", "zip");
        if (At(b, 0, "\x1f\x8b")) return ("application/gzip", "gz");
        if (At(b, 0, "7z\xbc\xaf\x27\x1c")) return ("application/x-7z-compressed", "7z");
        if (At(b, 0, "Rar!\x1a\x07")) return ("application/vnd.rar", "rar");
        if (At(b, 0, stackalloc byte[] { (byte)'S', (byte)'Q', (byte)'L', (byte)'i', (byte)'t', (byte)'e', (byte)' ', (byte)'f', (byte)'o', (byte)'r', (byte)'m', (byte)'a', (byte)'t', (byte)' ', (byte)'3', 0 })) return ("application/vnd.sqlite3", "sqlite");
        if (At(b, 0, stackalloc byte[] { 0, (byte)'a', (byte)'s', (byte)'m' })) return ("application/wasm", "wasm");
        if (At(b, 0, "OggS")) return ("audio/ogg", "ogg");
        if (At(b, 0, "fLaC")) return ("audio/flac", "flac");
        if (At(b, 0, "ID3") || (b.Length >= 2 && b[0] == 0xFF && (b[1] & 0xE0) == 0xE0 && (b[1] & 0x06) != 0)) return ("audio/mpeg", "mp3");
        if (At(b, 0, "\x1a\x45\xdf\xa3")) return ("video/webm", "webm");
        if (At(b, 4, "ftyp") && b.Length >= 12) {
            string brand = new(new[] { (char)b[8], (char)b[9], (char)b[10], (char)b[11] });
            return Ftyp.TryGetValue(brand, out var t) ? t : ("video/mp4", "mp4");
        }
        if (At(b, 0, "wOFF")) return ("font/woff", "woff");
        if (At(b, 0, "wOF2")) return ("font/woff2", "woff2");
        return null;
    }

    /// <summary>
    /// True when the content's detected type agrees with the file name's extension (case-insensitive; jpeg/jpe -&gt; jpg,
    /// tiff -&gt; tif). Zip content matches zip and zip containers (docx, xlsx, pptx, odt, ods, odp, jar, apk, epub); HEIC content
    /// matches heic or heif. A name without an extension never matches.
    /// </summary>
    public static bool MatchesExtension(ReadOnlySpan<byte> data, string filename) {
        ArgumentNullException.ThrowIfNull(filename);
        int dot = filename.LastIndexOf('.');
        if (dot < 0) return false;
        string ext = filename[(dot + 1)..].ToLowerInvariant();
        if (Aliases.TryGetValue(ext, out var alias)) ext = alias;
        var t = DetectFileType(data);
        if (t is null) return false;
        if (t.Value.Extension == "zip") return ZipExtensions.Contains(ext);
        if (t.Value.Extension == "heic") return ext is "heic" or "heif";
        return ext == t.Value.Extension;
    }
}
