// SPDX-License-Identifier: Apache-2.0

import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * File type detection from leading bytes (magic numbers) for upload checks. Detection is a first check, not a
 * malware scan: still re-encode or sandbox untrusted files.
 */
public final class FileSignature {
    private FileSignature() {}

    /** A detected media type and its canonical extension. */
    public record FileType(String mime, String extension) {}

    private static final Map<String, FileType> FTYP = Map.of(
        "avif", new FileType("image/avif", "avif"), "avis", new FileType("image/avif", "avif"),
        "heic", new FileType("image/heic", "heic"), "heix", new FileType("image/heic", "heic"),
        "mif1", new FileType("image/heif", "heif"), "msf1", new FileType("image/heif", "heif"),
        "qt  ", new FileType("video/quicktime", "mov"), "M4A ", new FileType("audio/mp4", "m4a"),
        "3gp4", new FileType("video/3gpp", "3gp"), "3gp5", new FileType("video/3gpp", "3gp"));

    private static final Map<String, String> ALIASES = Map.of("jpeg", "jpg", "jpe", "jpg", "tiff", "tif", "htm", "html", "mpeg", "mp3", "heif", "heif");

    private static final Set<String> ZIP_EXTS = Set.of("zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub");

    private static boolean at(byte[] b, int off, int... sig) {
        if (b.length < off + sig.length) return false;
        for (int i = 0; i < sig.length; i++) if ((b[off + i] & 0xFF) != sig[i]) return false;
        return true;
    }

    private static boolean at(byte[] b, int off, String ascii) {
        return at(b, off, ascii.chars().toArray());
    }

    /** The detected type, or null when unrecognised; reads at most the first 64 bytes. */
    public static FileType detectFileType(byte[] data) {
        byte[] b = Arrays.copyOf(data, Math.min(64, data.length));
        if (at(b, 0, 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A)) return new FileType("image/png", "png");
        if (at(b, 0, 0xFF, 0xD8, 0xFF)) return new FileType("image/jpeg", "jpg");
        if (at(b, 0, "GIF87a") || at(b, 0, "GIF89a")) return new FileType("image/gif", "gif");
        if (at(b, 0, "RIFF") && at(b, 8, "WEBP")) return new FileType("image/webp", "webp");
        if (at(b, 0, "RIFF") && at(b, 8, "WAVE")) return new FileType("audio/wav", "wav");
        if (at(b, 0, "RIFF") && at(b, 8, "AVI ")) return new FileType("video/x-msvideo", "avi");
        if (at(b, 0, "BM") && b.length >= 14) return new FileType("image/bmp", "bmp");
        if (at(b, 0, 0x00, 0x00, 0x01, 0x00)) return new FileType("image/x-icon", "ico");
        if (at(b, 0, 'I', 'I', '*', 0x00) || at(b, 0, 'M', 'M', 0x00, '*')) return new FileType("image/tiff", "tif");
        if (at(b, 0, "%PDF-")) return new FileType("application/pdf", "pdf");
        if (at(b, 0, 'P', 'K', 0x03, 0x04) || at(b, 0, 'P', 'K', 0x05, 0x06)) return new FileType("application/zip", "zip");
        if (at(b, 0, 0x1F, 0x8B)) return new FileType("application/gzip", "gz");
        if (at(b, 0, '7', 'z', 0xBC, 0xAF, 0x27, 0x1C)) return new FileType("application/x-7z-compressed", "7z");
        if (at(b, 0, 'R', 'a', 'r', '!', 0x1A, 0x07)) return new FileType("application/vnd.rar", "rar");
        if (at(b, 0, "SQLite format 3\0")) return new FileType("application/vnd.sqlite3", "sqlite");
        if (at(b, 0, 0x00, 'a', 's', 'm')) return new FileType("application/wasm", "wasm");
        if (at(b, 0, "OggS")) return new FileType("audio/ogg", "ogg");
        if (at(b, 0, "fLaC")) return new FileType("audio/flac", "flac");
        if (at(b, 0, "ID3") || (b.length >= 2 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xE0) == 0xE0 && (b[1] & 0x06) != 0)) return new FileType("audio/mpeg", "mp3");
        if (at(b, 0, 0x1A, 0x45, 0xDF, 0xA3)) return new FileType("video/webm", "webm");
        if (at(b, 4, "ftyp") && b.length >= 12) {
            StringBuilder brand = new StringBuilder();
            for (int i = 8; i < 12; i++) brand.append((char) (b[i] & 0xFF));
            FileType t = FTYP.get(brand.toString());
            return t != null ? t : new FileType("video/mp4", "mp4");
        }
        if (at(b, 0, "wOFF")) return new FileType("font/woff", "woff");
        if (at(b, 0, "wOF2")) return new FileType("font/woff2", "woff2");
        return null;
    }

    /** True when the detected content type agrees with the file name's extension (case-insensitive; zip containers and heic/heif aliases). */
    public static boolean matchesExtension(byte[] data, String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0) return false;
        String ext = filename.substring(dot + 1).toLowerCase(Locale.ROOT);
        ext = ALIASES.getOrDefault(ext, ext);
        FileType t = detectFileType(data);
        if (t == null) return false;
        if (t.extension().equals("zip")) return ZIP_EXTS.contains(ext);
        if (t.extension().equals("heic")) return ext.equals("heic") || ext.equals("heif");
        return ext.equals(t.extension());
    }
}
