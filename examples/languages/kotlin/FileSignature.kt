// SPDX-License-Identifier: Apache-2.0

/**
 * File type detection from leading bytes (magic numbers) for upload checks. Detection is a first check, not a
 * malware scan: still re-encode or sandbox untrusted files.
 */
object FileSignature {
    /** A detected media type and its canonical extension. */
    data class FileType(val mime: String, val extension: String)

    private val FTYP = mapOf(
        "avif" to FileType("image/avif", "avif"), "avis" to FileType("image/avif", "avif"),
        "heic" to FileType("image/heic", "heic"), "heix" to FileType("image/heic", "heic"),
        "mif1" to FileType("image/heif", "heif"), "msf1" to FileType("image/heif", "heif"),
        "qt  " to FileType("video/quicktime", "mov"), "M4A " to FileType("audio/mp4", "m4a"),
        "3gp4" to FileType("video/3gpp", "3gp"), "3gp5" to FileType("video/3gpp", "3gp"),
    )
    private val ALIASES = mapOf("jpeg" to "jpg", "jpe" to "jpg", "tiff" to "tif", "htm" to "html", "mpeg" to "mp3", "heif" to "heif")
    private val ZIP_EXTS = setOf("zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub")

    private fun at(b: ByteArray, off: Int, vararg sig: Int): Boolean {
        if (b.size < off + sig.size) return false
        for (i in sig.indices) if ((b[off + i].toInt() and 0xFF) != sig[i]) return false
        return true
    }

    private fun at(b: ByteArray, off: Int, ascii: String): Boolean = at(b, off, *ascii.map { it.code }.toIntArray())

    /** The detected type, or null when unrecognised; reads at most the first 64 bytes. */
    fun detectFileType(data: ByteArray): FileType? {
        val b = data.copyOf(minOf(64, data.size))
        val u = { i: Int -> b[i].toInt() and 0xFF }
        return when {
            at(b, 0, 0x89, 'P'.code, 'N'.code, 'G'.code, 0x0D, 0x0A, 0x1A, 0x0A) -> FileType("image/png", "png")
            at(b, 0, 0xFF, 0xD8, 0xFF) -> FileType("image/jpeg", "jpg")
            at(b, 0, "GIF87a") || at(b, 0, "GIF89a") -> FileType("image/gif", "gif")
            at(b, 0, "RIFF") && at(b, 8, "WEBP") -> FileType("image/webp", "webp")
            at(b, 0, "RIFF") && at(b, 8, "WAVE") -> FileType("audio/wav", "wav")
            at(b, 0, "RIFF") && at(b, 8, "AVI ") -> FileType("video/x-msvideo", "avi")
            at(b, 0, "BM") && b.size >= 14 -> FileType("image/bmp", "bmp")
            at(b, 0, 0x00, 0x00, 0x01, 0x00) -> FileType("image/x-icon", "ico")
            at(b, 0, "II*\u0000") || at(b, 0, "MM\u0000*") -> FileType("image/tiff", "tif")
            at(b, 0, "%PDF-") -> FileType("application/pdf", "pdf")
            at(b, 0, "PK\u0003\u0004") || at(b, 0, "PK\u0005\u0006") -> FileType("application/zip", "zip")
            at(b, 0, 0x1F, 0x8B) -> FileType("application/gzip", "gz")
            at(b, 0, '7'.code, 'z'.code, 0xBC, 0xAF, 0x27, 0x1C) -> FileType("application/x-7z-compressed", "7z")
            at(b, 0, "Rar!\u001A\u0007") -> FileType("application/vnd.rar", "rar")
            at(b, 0, "SQLite format 3\u0000") -> FileType("application/vnd.sqlite3", "sqlite")
            at(b, 0, "\u0000asm") -> FileType("application/wasm", "wasm")
            at(b, 0, "OggS") -> FileType("audio/ogg", "ogg")
            at(b, 0, "fLaC") -> FileType("audio/flac", "flac")
            at(b, 0, "ID3") || (b.size >= 2 && u(0) == 0xFF && (u(1) and 0xE0) == 0xE0 && (u(1) and 0x06) != 0) -> FileType("audio/mpeg", "mp3")
            at(b, 0, 0x1A, 0x45, 0xDF, 0xA3) -> FileType("video/webm", "webm")
            at(b, 4, "ftyp") && b.size >= 12 -> FTYP[String(CharArray(4) { u(8 + it).toChar() })] ?: FileType("video/mp4", "mp4")
            at(b, 0, "wOFF") -> FileType("font/woff", "woff")
            at(b, 0, "wOF2") -> FileType("font/woff2", "woff2")
            else -> null
        }
    }

    /** True when the detected content type agrees with [filename]'s extension (case-insensitive; zip containers and heic/heif aliases). */
    fun matchesExtension(data: ByteArray, filename: String): Boolean {
        val dot = filename.lastIndexOf('.')
        if (dot < 0) return false
        val raw = filename.substring(dot + 1).lowercase()
        val ext = ALIASES[raw] ?: raw
        val t = detectFileType(data) ?: return false
        return when (t.extension) {
            "zip" -> ext in ZIP_EXTS
            "heic" -> ext == "heic" || ext == "heif"
            else -> ext == t.extension
        }
    }
}
