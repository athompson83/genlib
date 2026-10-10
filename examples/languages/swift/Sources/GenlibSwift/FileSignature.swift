// SPDX-License-Identifier: Apache-2.0
// File type detection from leading bytes (magic numbers) for upload checks; the first matching rule wins. Detection is
// a first check, not a malware scan: still re-encode or sandbox untrusted files and enforce size limits.

/// A detected format: MIME type and canonical file extension.
public struct FileType: Equatable, Sendable {
    public let mime: String
    public let ext: String
    public init(mime: String, ext: String) { self.mime = mime; self.ext = ext }
}

public enum FileSignature {
    private static func at(_ b: [UInt8], _ off: Int, _ sig: [UInt8]) -> Bool {
        b.count >= off + sig.count && Array(b[off..<(off + sig.count)]) == sig
    }

    private static func ascii(_ s: String) -> [UInt8] { Array(s.utf8) }

    private static let ftyp: [[UInt8]: FileType] = [
        ascii("avif"): FileType(mime: "image/avif", ext: "avif"), ascii("avis"): FileType(mime: "image/avif", ext: "avif"),
        ascii("heic"): FileType(mime: "image/heic", ext: "heic"), ascii("heix"): FileType(mime: "image/heic", ext: "heic"),
        ascii("mif1"): FileType(mime: "image/heif", ext: "heif"), ascii("msf1"): FileType(mime: "image/heif", ext: "heif"),
        ascii("qt  "): FileType(mime: "video/quicktime", ext: "mov"), ascii("M4A "): FileType(mime: "audio/mp4", ext: "m4a"),
        ascii("3gp4"): FileType(mime: "video/3gpp", ext: "3gp"), ascii("3gp5"): FileType(mime: "video/3gpp", ext: "3gp"),
    ]

    /// The recognised format of the content (uses at most the first 64 bytes), or nil. A first check, not a malware scan.
    public static func detect(_ data: [UInt8]) -> FileType? {
        let b = Array(data.prefix(64))
        func t(_ mime: String, _ ext: String) -> FileType { FileType(mime: mime, ext: ext) }
        if at(b, 0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return t("image/png", "png") }
        if at(b, 0, [0xFF, 0xD8, 0xFF]) { return t("image/jpeg", "jpg") }
        if at(b, 0, ascii("GIF87a")) || at(b, 0, ascii("GIF89a")) { return t("image/gif", "gif") }
        if at(b, 0, ascii("RIFF")) && at(b, 8, ascii("WEBP")) { return t("image/webp", "webp") }
        if at(b, 0, ascii("RIFF")) && at(b, 8, ascii("WAVE")) { return t("audio/wav", "wav") }
        if at(b, 0, ascii("RIFF")) && at(b, 8, ascii("AVI ")) { return t("video/x-msvideo", "avi") }
        if at(b, 0, ascii("BM")) && b.count >= 14 { return t("image/bmp", "bmp") }
        if at(b, 0, [0x00, 0x00, 0x01, 0x00]) { return t("image/x-icon", "ico") }
        if at(b, 0, [0x49, 0x49, 0x2A, 0x00]) || at(b, 0, [0x4D, 0x4D, 0x00, 0x2A]) { return t("image/tiff", "tif") }
        if at(b, 0, ascii("%PDF-")) { return t("application/pdf", "pdf") }
        if at(b, 0, [0x50, 0x4B, 0x03, 0x04]) || at(b, 0, [0x50, 0x4B, 0x05, 0x06]) { return t("application/zip", "zip") }
        if at(b, 0, [0x1F, 0x8B]) { return t("application/gzip", "gz") }
        if at(b, 0, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) { return t("application/x-7z-compressed", "7z") }
        if at(b, 0, [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07]) { return t("application/vnd.rar", "rar") }
        if at(b, 0, ascii("SQLite format 3") + [0x00]) { return t("application/vnd.sqlite3", "sqlite") }
        if at(b, 0, [0x00, 0x61, 0x73, 0x6D]) { return t("application/wasm", "wasm") }
        if at(b, 0, ascii("OggS")) { return t("audio/ogg", "ogg") }
        if at(b, 0, ascii("fLaC")) { return t("audio/flac", "flac") }
        if at(b, 0, ascii("ID3")) || (b.count >= 2 && b[0] == 0xFF && (b[1] & 0xE0) == 0xE0 && (b[1] & 0x06) != 0) {
            return t("audio/mpeg", "mp3")
        }
        if at(b, 0, [0x1A, 0x45, 0xDF, 0xA3]) { return t("video/webm", "webm") }
        if at(b, 4, ascii("ftyp")) && b.count >= 12 { return ftyp[Array(b[8..<12])] ?? t("video/mp4", "mp4") }
        if at(b, 0, ascii("wOFF")) { return t("font/woff", "woff") }
        if at(b, 0, ascii("wOF2")) { return t("font/woff2", "woff2") }
        return nil
    }

    private static let aliases = ["jpeg": "jpg", "jpe": "jpg", "tiff": "tif", "htm": "html", "mpeg": "mp3"]
    private static let zipFamily: Set<String> = ["zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub"]

    /// True when the detected content type agrees with the file name's extension (case-insensitive; zip content matches
    /// zip-based formats such as docx/xlsx/jar/epub; heic content matches heic or heif; no extension is false).
    public static func matchesExtension(_ data: [UInt8], filename: String) -> Bool {
        guard let dot = filename.lastIndex(of: ".") else { return false }
        var ext = String(filename[filename.index(after: dot)...]).lowercased()
        ext = aliases[ext] ?? ext
        guard let t = detect(data) else { return false }
        if t.ext == "zip" { return zipFamily.contains(ext) }
        if t.ext == "heic" { return ext == "heic" || ext == "heif" }
        return ext == t.ext
    }
}
