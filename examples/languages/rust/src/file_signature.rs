// SPDX-License-Identifier: Apache-2.0

//! File type detection from leading bytes (magic numbers) for upload checks.
//! Detection is a first check, not a malware scan: still re-encode or sandbox
//! untrusted files.

fn at(b: &[u8], off: usize, sig: &[u8]) -> bool {
    b.len() >= off + sig.len() && &b[off..off + sig.len()] == sig
}

const FTYP: [(&[u8; 4], &str, &str); 10] = [
    (b"avif", "image/avif", "avif"),
    (b"avis", "image/avif", "avif"),
    (b"heic", "image/heic", "heic"),
    (b"heix", "image/heic", "heic"),
    (b"mif1", "image/heif", "heif"),
    (b"msf1", "image/heif", "heif"),
    (b"qt  ", "video/quicktime", "mov"),
    (b"M4A ", "audio/mp4", "m4a"),
    (b"3gp4", "video/3gpp", "3gp"),
    (b"3gp5", "video/3gpp", "3gp"),
];

/// `(mime, extension)` for a recognised format from at most the first 64 bytes, else None; not a malware scan.
pub fn detect_file_type(data: &[u8]) -> Option<(&'static str, &'static str)> {
    let b = &data[..data.len().min(64)];
    let found = if at(b, 0, b"\x89PNG\r\n\x1a\n") {
        ("image/png", "png")
    } else if at(b, 0, b"\xff\xd8\xff") {
        ("image/jpeg", "jpg")
    } else if at(b, 0, b"GIF87a") || at(b, 0, b"GIF89a") {
        ("image/gif", "gif")
    } else if at(b, 0, b"RIFF") && at(b, 8, b"WEBP") {
        ("image/webp", "webp")
    } else if at(b, 0, b"RIFF") && at(b, 8, b"WAVE") {
        ("audio/wav", "wav")
    } else if at(b, 0, b"RIFF") && at(b, 8, b"AVI ") {
        ("video/x-msvideo", "avi")
    } else if at(b, 0, b"BM") && b.len() >= 14 {
        ("image/bmp", "bmp")
    } else if at(b, 0, b"\x00\x00\x01\x00") {
        ("image/x-icon", "ico")
    } else if at(b, 0, b"II*\x00") || at(b, 0, b"MM\x00*") {
        ("image/tiff", "tif")
    } else if at(b, 0, b"%PDF-") {
        ("application/pdf", "pdf")
    } else if at(b, 0, b"PK\x03\x04") || at(b, 0, b"PK\x05\x06") {
        ("application/zip", "zip")
    } else if at(b, 0, b"\x1f\x8b") {
        ("application/gzip", "gz")
    } else if at(b, 0, b"7z\xbc\xaf\x27\x1c") {
        ("application/x-7z-compressed", "7z")
    } else if at(b, 0, b"Rar!\x1a\x07") {
        ("application/vnd.rar", "rar")
    } else if at(b, 0, b"SQLite format 3\x00") {
        ("application/vnd.sqlite3", "sqlite")
    } else if at(b, 0, b"\x00asm") {
        ("application/wasm", "wasm")
    } else if at(b, 0, b"OggS") {
        ("audio/ogg", "ogg")
    } else if at(b, 0, b"fLaC") {
        ("audio/flac", "flac")
    } else if at(b, 0, b"ID3") || (b.len() >= 2 && b[0] == 0xFF && b[1] & 0xE0 == 0xE0 && b[1] & 0x06 != 0) {
        ("audio/mpeg", "mp3")
    } else if at(b, 0, b"\x1aE\xdf\xa3") {
        ("video/webm", "webm")
    } else if at(b, 4, b"ftyp") && b.len() >= 12 {
        FTYP.iter()
            .find(|(brand, _, _)| &b[8..12] == brand.as_slice())
            .map_or(("video/mp4", "mp4"), |&(_, m, e)| (m, e))
    } else if at(b, 0, b"wOFF") {
        ("font/woff", "woff")
    } else if at(b, 0, b"wOF2") {
        ("font/woff2", "woff2")
    } else {
        return None;
    };
    Some(found)
}

/// True when the detected type agrees with `filename`'s extension (case-insensitive; zip containers such as docx match zip content).
pub fn matches_extension(data: &[u8], filename: &str) -> bool {
    let Some((_, ext)) = filename.rsplit_once('.') else {
        return false;
    };
    let lower = ext.to_lowercase();
    let ext = match lower.as_str() {
        "jpeg" | "jpe" => "jpg",
        "tiff" => "tif",
        "htm" => "html",
        "mpeg" => "mp3",
        e => e,
    };
    match detect_file_type(data) {
        None => false,
        Some((_, "zip")) => matches!(ext, "zip" | "docx" | "xlsx" | "pptx" | "odt" | "ods" | "odp" | "jar" | "apk" | "epub"),
        Some((_, "heic")) => ext == "heic" || ext == "heif",
        Some((_, detected)) => ext == detected,
    }
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    fn unhex(s: &str) -> Vec<u8> {
        (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
    }

    #[test]
    fn detect_vectors() {
        let cases: &[(&str, &str, Option<(&str, &str)>)] = &[
            ("png", "89504e470d0a1a0a0000000d49484452", Some(("image/png", "png"))),
            ("jpg", "ffd8ffe000104a464946", Some(("image/jpeg", "jpg"))),
            ("gif", "4749463839610100", Some(("image/gif", "gif"))),
            ("webp", "52494646240000005745425056503820", Some(("image/webp", "webp"))),
            ("wav", "524946462400000057415645666d7420", Some(("audio/wav", "wav"))),
            ("avi", "5249464624000000415649204c495354", Some(("video/x-msvideo", "avi"))),
            ("bmp", "424d0000000000000000000000000000", Some(("image/bmp", "bmp"))),
            ("ico", "000001000100", Some(("image/x-icon", "ico"))),
            ("tif", "49492a000800", Some(("image/tiff", "tif"))),
            ("tif-be", "4d4d002a0008", Some(("image/tiff", "tif"))),
            ("pdf", "255044462d312e370a", Some(("application/pdf", "pdf"))),
            ("zip", "504b03041400", Some(("application/zip", "zip"))),
            ("zip-empty", "504b0506000000000000000000000000000000000000", Some(("application/zip", "zip"))),
            ("gz", "1f8b0800", Some(("application/gzip", "gz"))),
            ("7z", "377abcaf271c0004", Some(("application/x-7z-compressed", "7z"))),
            ("rar", "526172211a070100", Some(("application/vnd.rar", "rar"))),
            ("sqlite", "53514c69746520666f726d61742033001000", Some(("application/vnd.sqlite3", "sqlite"))),
            ("wasm", "0061736d01000000", Some(("application/wasm", "wasm"))),
            ("ogg", "4f6767530002", Some(("audio/ogg", "ogg"))),
            ("flac", "664c614300000022", Some(("audio/flac", "flac"))),
            ("mp3-id3", "494433040000", Some(("audio/mpeg", "mp3"))),
            ("mp3-frame", "fffb9064", Some(("audio/mpeg", "mp3"))),
            ("webm", "1a45dfa39f4286", Some(("video/webm", "webm"))),
            ("mp4", "000000206674797069736f6d00000200", Some(("video/mp4", "mp4"))),
            ("mov", "00000014667479707174202000000000", Some(("video/quicktime", "mov"))),
            ("heic", "00000018667479706865696300000000", Some(("image/heic", "heic"))),
            ("avif", "0000001c667479706176696600000000", Some(("image/avif", "avif"))),
            ("m4a", "00000020667479704d34412000000000", Some(("audio/mp4", "m4a"))),
            ("woff", "774f464600010000", Some(("font/woff", "woff"))),
            ("woff2", "774f463200010000", Some(("font/woff2", "woff2"))),
            ("text", "68656c6c6f20776f726c64", None),
            ("empty", "", None),
            ("short-png", "89504e47", None),
            ("bm-short", "424d0000", None),
            ("ff-not-mp3", "ffe10000", None),
            ("html", "3c21444f43545950452068746d6c3e", None),
        ];
        for &(name, hex, want) in cases {
            assert_eq!(detect_file_type(&unhex(hex)), want, "{name}");
        }
    }

    #[test]
    fn extension_vectors() {
        let cases: &[(&str, &str, bool)] = &[
            ("89504e470d0a1a0a0000000d49484452", "a.png", true),
            ("89504e470d0a1a0a0000000d49484452", "a.PNG", true),
            ("89504e470d0a1a0a0000000d49484452", "a.jpg", false),
            ("ffd8ffe000104a464946", "photo.jpeg", true),
            ("504b03041400", "report.docx", true),
            ("504b03041400", "x.xlsx", true),
            ("255044462d312e370a", "x.pdf.exe", false),
            ("00000018667479706865696300000000", "IMG_1.HEIF", true),
            ("68656c6c6f20776f726c64", "a.txt", false),
            ("89504e470d0a1a0a0000000d49484452", "noext", false),
            ("49492a000800", "scan.tiff", true),
            ("494433040000", "song.mp3", true),
            ("1f8b0800", "a.tar.gz", true),
        ];
        for &(hex, filename, want) in cases {
            assert_eq!(matches_extension(&unhex(hex), filename), want, "{hex} {filename}");
        }
    }
}
