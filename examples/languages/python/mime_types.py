# SPDX-License-Identifier: Apache-2.0
"""MIME type <-> file extension lookup for common web and document formats (IANA registry names).

Lookups are case-insensitive on the text after the last '.' (a name without '.' is the extension itself, so
"json" and ".png" both work). The first table row for a type is its canonical extension. content_type_for
adds "; charset=utf-8" to text types and falls back to application/octet-stream.
"""

# (extension, type); order matters: the first row for a type is its canonical extension.
TABLE: list[tuple[str, str]] = [
    ("html", "text/html"), ("htm", "text/html"), ("css", "text/css"), ("js", "text/javascript"),
    ("mjs", "text/javascript"), ("cjs", "text/javascript"), ("json", "application/json"),
    ("map", "application/json"), ("jsonld", "application/ld+json"),
    ("webmanifest", "application/manifest+json"), ("xml", "application/xml"), ("txt", "text/plain"),
    ("text", "text/plain"), ("log", "text/plain"), ("md", "text/markdown"), ("markdown", "text/markdown"),
    ("csv", "text/csv"), ("tsv", "text/tab-separated-values"), ("ics", "text/calendar"), ("vcf", "text/vcard"),
    ("yaml", "application/yaml"), ("yml", "application/yaml"), ("toml", "application/toml"),
    ("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"), ("gif", "image/gif"),
    ("webp", "image/webp"), ("avif", "image/avif"), ("svg", "image/svg+xml"),
    ("ico", "image/vnd.microsoft.icon"), ("bmp", "image/bmp"), ("tif", "image/tiff"), ("tiff", "image/tiff"),
    ("heic", "image/heic"), ("mp3", "audio/mpeg"), ("wav", "audio/wav"), ("ogg", "audio/ogg"),
    ("oga", "audio/ogg"), ("m4a", "audio/mp4"), ("flac", "audio/flac"), ("weba", "audio/webm"),
    ("opus", "audio/opus"), ("mp4", "video/mp4"), ("m4v", "video/mp4"), ("webm", "video/webm"),
    ("ogv", "video/ogg"), ("mov", "video/quicktime"), ("avi", "video/x-msvideo"), ("mpeg", "video/mpeg"),
    ("woff", "font/woff"), ("woff2", "font/woff2"), ("ttf", "font/ttf"), ("otf", "font/otf"),
    ("pdf", "application/pdf"), ("zip", "application/zip"), ("gz", "application/gzip"),
    ("tar", "application/x-tar"), ("7z", "application/x-7z-compressed"), ("rar", "application/vnd.rar"),
    ("bz2", "application/x-bzip2"), ("doc", "application/msword"),
    ("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ("xls", "application/vnd.ms-excel"),
    ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ("ppt", "application/vnd.ms-powerpoint"),
    ("pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ("odt", "application/vnd.oasis.opendocument.text"),
    ("ods", "application/vnd.oasis.opendocument.spreadsheet"),
    ("odp", "application/vnd.oasis.opendocument.presentation"), ("rtf", "application/rtf"),
    ("epub", "application/epub+zip"), ("wasm", "application/wasm"), ("bin", "application/octet-stream"),
    ("exe", "application/vnd.microsoft.portable-executable"), ("sh", "application/x-sh"),
    ("apk", "application/vnd.android.package-archive"), ("jar", "application/java-archive"),
    ("swf", "application/x-shockwave-flash"),
]
_BY_EXT = {e: t for e, t in TABLE}
_BY_TYPE: dict[str, str] = {}
for _e, _t in TABLE:
    _BY_TYPE.setdefault(_t, _e)
_TEXT_EXTRA = frozenset({
    "application/json", "application/ld+json", "application/manifest+json", "application/xml",
    "application/yaml", "application/toml", "image/svg+xml", "text/javascript",
})


def mime_type_for(name: str) -> str | None:
    """The MIME type for a file name or bare extension, or None when unknown."""
    ext = name.rsplit(".", 1)[-1].lower() if name else ""
    return _BY_EXT.get(ext)


def extension_for(mime: str) -> str | None:
    """The canonical extension (without '.') for a MIME type; parameters and case are ignored."""
    return _BY_TYPE.get(mime.split(";", 1)[0].strip().lower())


def content_type_for(name: str) -> str:
    """A Content-Type header value for a file name: text types get '; charset=utf-8', unknown -> octet-stream."""
    t = mime_type_for(name)
    if t is None:
        return "application/octet-stream"
    return t + "; charset=utf-8" if t.startswith("text/") or t in _TEXT_EXTRA else t
