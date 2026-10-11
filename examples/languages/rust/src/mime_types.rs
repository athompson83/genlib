// SPDX-License-Identifier: Apache-2.0

//! MIME type <-> file extension lookup for common web and document formats.
//! Lookup is case-insensitive on the text after the last '.'; a name without
//! '.' is itself the extension ("json"). The first table row for a type is its
//! canonical extension.

/// (extension, type) rows; order matters for canonical extensions.
const TABLE: &[(&str, &str)] = &[
    ("html", "text/html"), ("htm", "text/html"), ("css", "text/css"), ("js", "text/javascript"),
    ("mjs", "text/javascript"), ("cjs", "text/javascript"), ("json", "application/json"),
    ("map", "application/json"), ("jsonld", "application/ld+json"),
    ("webmanifest", "application/manifest+json"), ("xml", "application/xml"), ("txt", "text/plain"),
    ("text", "text/plain"), ("log", "text/plain"), ("md", "text/markdown"), ("markdown", "text/markdown"),
    ("csv", "text/csv"), ("tsv", "text/tab-separated-values"), ("ics", "text/calendar"),
    ("vcf", "text/vcard"), ("yaml", "application/yaml"), ("yml", "application/yaml"),
    ("toml", "application/toml"), ("png", "image/png"), ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"),
    ("gif", "image/gif"), ("webp", "image/webp"), ("avif", "image/avif"), ("svg", "image/svg+xml"),
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
];

const TEXT_EXTRA: &[&str] = &["application/json", "application/ld+json", "application/manifest+json", "application/toml", "application/xml", "application/yaml", "image/svg+xml", "text/javascript"];

/// Returns the MIME type for a file name or bare extension, or `None` when unknown.
pub fn mime_type_for(name: &str) -> Option<&'static str> {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    TABLE.iter().find(|r| r.0 == ext).map(|r| r.1)
}

/// Returns the canonical extension for a MIME type (parameters and case ignored), or `None` when unknown.
pub fn extension_for(mime: &str) -> Option<&'static str> {
    let base = mime.split(';').next().unwrap_or("").trim().to_lowercase();
    TABLE.iter().find(|r| r.1 == base).map(|r| r.0)
}

/// Returns a Content-Type value for a file name, adding "; charset=utf-8" for text types and falling back to application/octet-stream.
pub fn content_type_for(name: &str) -> String {
    match mime_type_for(name) {
        None => "application/octet-stream".to_string(),
        Some(t) if t.starts_with("text/") || TEXT_EXTRA.contains(&t) => format!("{t}; charset=utf-8"),
        Some(t) => t.to_string(),
    }
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn type_for_vectors() {
        let cases: &[(&str, Option<&str>)] = &[
            ("index.html", Some("text/html")),
            ("APP.JS", Some("text/javascript")),
            ("data.json", Some("application/json")),
            ("photo.JPG", Some("image/jpeg")),
            ("x.tar.gz", Some("application/gzip")),
            ("video.webm", Some("video/webm")),
            ("font.woff2", Some("font/woff2")),
            ("doc.docx", Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ("noext", None),
            ("json", Some("application/json")),
            (".png", Some("image/png")),
            ("a.unknown", None),
            ("style.css", Some("text/css")),
            ("feed.xml", Some("application/xml")),
            ("pic.svg", Some("image/svg+xml")),
        ];
        for &(n, want) in cases {
            assert_eq!(mime_type_for(n), want, "{n:?}");
        }
    }

    #[test]
    fn extension_for_vectors() {
        let cases: &[(&str, Option<&str>)] = &[
            ("image/jpeg", Some("jpg")),
            ("text/html; charset=UTF-8", Some("html")),
            ("Application/JSON", Some("json")),
            ("text/javascript", Some("js")),
            ("application/x-unknown", None),
            ("video/mp4", Some("mp4")),
        ];
        for &(m, want) in cases {
            assert_eq!(extension_for(m), want, "{m:?}");
        }
    }

    #[test]
    fn content_type_vectors() {
        let cases: &[(&str, &str)] = &[
            ("a.html", "text/html; charset=utf-8"),
            ("a.json", "application/json; charset=utf-8"),
            ("a.png", "image/png"),
            ("a.svg", "image/svg+xml; charset=utf-8"),
            ("a.bin", "application/octet-stream"),
            ("a.zzz", "application/octet-stream"),
            ("readme.md", "text/markdown; charset=utf-8"),
        ];
        for &(n, want) in cases {
            assert_eq!(content_type_for(n), want, "{n:?}");
        }
    }
}
