// SPDX-License-Identifier: Apache-2.0

/** MIME type and file extension lookup for common web and document formats (IANA registry names). */
object MimeTypes {
    /** Extension/type pairs; the first row for a type is its canonical extension. */
    private val TABLE = arrayOf(
        "html", "text/html", "htm", "text/html", "css", "text/css", "js", "text/javascript",
        "mjs", "text/javascript", "cjs", "text/javascript", "json", "application/json", "map", "application/json",
        "jsonld", "application/ld+json", "webmanifest", "application/manifest+json", "xml", "application/xml",
        "txt", "text/plain", "text", "text/plain", "log", "text/plain", "md", "text/markdown",
        "markdown", "text/markdown", "csv", "text/csv", "tsv", "text/tab-separated-values", "ics", "text/calendar",
        "vcf", "text/vcard", "yaml", "application/yaml", "yml", "application/yaml", "toml", "application/toml",
        "png", "image/png", "jpg", "image/jpeg", "jpeg", "image/jpeg", "gif", "image/gif", "webp", "image/webp",
        "avif", "image/avif", "svg", "image/svg+xml", "ico", "image/vnd.microsoft.icon", "bmp", "image/bmp",
        "tif", "image/tiff", "tiff", "image/tiff", "heic", "image/heic", "mp3", "audio/mpeg", "wav", "audio/wav",
        "ogg", "audio/ogg", "oga", "audio/ogg", "m4a", "audio/mp4", "flac", "audio/flac", "weba", "audio/webm",
        "opus", "audio/opus", "mp4", "video/mp4", "m4v", "video/mp4", "webm", "video/webm", "ogv", "video/ogg",
        "mov", "video/quicktime", "avi", "video/x-msvideo", "mpeg", "video/mpeg", "woff", "font/woff",
        "woff2", "font/woff2", "ttf", "font/ttf", "otf", "font/otf", "pdf", "application/pdf",
        "zip", "application/zip", "gz", "application/gzip", "tar", "application/x-tar",
        "7z", "application/x-7z-compressed", "rar", "application/vnd.rar", "bz2", "application/x-bzip2",
        "doc", "application/msword",
        "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls", "application/vnd.ms-excel",
        "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt", "application/vnd.ms-powerpoint",
        "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "odt", "application/vnd.oasis.opendocument.text", "ods", "application/vnd.oasis.opendocument.spreadsheet",
        "odp", "application/vnd.oasis.opendocument.presentation", "rtf", "application/rtf",
        "epub", "application/epub+zip", "wasm", "application/wasm", "bin", "application/octet-stream",
        "exe", "application/vnd.microsoft.portable-executable", "sh", "application/x-sh",
        "apk", "application/vnd.android.package-archive", "jar", "application/java-archive",
        "swf", "application/x-shockwave-flash"
    )
    private val byExt = HashMap<String, String>()
    private val byType = HashMap<String, String>()
    private val textExtra = setOf("application/json", "application/ld+json", "application/manifest+json",
        "application/toml", "application/xml", "application/yaml", "image/svg+xml", "text/javascript")

    init {
        for (i in TABLE.indices step 2) {
            byExt[TABLE[i]] = TABLE[i + 1]
            byType.putIfAbsent(TABLE[i + 1], TABLE[i])
        }
    }

    /** MIME type for a file name or bare extension (case-insensitive, text after the last '.'), or null if unknown. */
    fun mimeTypeFor(name: String): String? = byExt[name.substringAfterLast('.').lowercase()]

    /** Canonical extension (without '.') for a MIME type, ignoring parameters and case, or null if unknown. */
    fun extensionFor(type: String): String? = byType[type.substringBefore(';').trim().lowercase()]

    /** Content-Type header value for a file name: text types get "; charset=utf-8", unknown is application/octet-stream. */
    fun contentTypeFor(name: String): String {
        val t = mimeTypeFor(name) ?: return "application/octet-stream"
        return if (t.startsWith("text/") || t in textExtra) "$t; charset=utf-8" else t
    }
}
