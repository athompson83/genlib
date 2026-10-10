# SPDX-License-Identifier: Apache-2.0
"""File type detection from leading bytes (magic numbers) for upload checks.

Detection is a first check, not a malware scan: still re-encode or sandbox untrusted files. Checks run
in a fixed order and the first match wins; at most the first 64 bytes are read.
"""

_FTYP = {
    b"avif": ("image/avif", "avif"), b"avis": ("image/avif", "avif"),
    b"heic": ("image/heic", "heic"), b"heix": ("image/heic", "heic"),
    b"mif1": ("image/heif", "heif"), b"msf1": ("image/heif", "heif"),
    b"qt  ": ("video/quicktime", "mov"), b"M4A ": ("audio/mp4", "m4a"),
    b"3gp4": ("video/3gpp", "3gp"), b"3gp5": ("video/3gpp", "3gp"),
}
_ZIP_EXTENSIONS = ("zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub")
_ALIASES = {"jpeg": "jpg", "jpe": "jpg", "tiff": "tif"}


def _at(b: bytes, offset: int, sig: bytes) -> bool:
    return b[offset:offset + len(sig)] == sig


def detect_file_type(data: bytes) -> tuple[str, str] | None:
    """(mime, extension) for a recognised format, else None. Not a malware scan."""
    b = bytes(data[:64])
    if _at(b, 0, b"\x89PNG\r\n\x1a\n"):
        return ("image/png", "png")
    if _at(b, 0, b"\xff\xd8\xff"):
        return ("image/jpeg", "jpg")
    if _at(b, 0, b"GIF87a") or _at(b, 0, b"GIF89a"):
        return ("image/gif", "gif")
    if _at(b, 0, b"RIFF") and _at(b, 8, b"WEBP"):
        return ("image/webp", "webp")
    if _at(b, 0, b"RIFF") and _at(b, 8, b"WAVE"):
        return ("audio/wav", "wav")
    if _at(b, 0, b"RIFF") and _at(b, 8, b"AVI "):
        return ("video/x-msvideo", "avi")
    if _at(b, 0, b"BM") and len(b) >= 14:
        return ("image/bmp", "bmp")
    if _at(b, 0, b"\x00\x00\x01\x00"):
        return ("image/x-icon", "ico")
    if _at(b, 0, b"II*\x00") or _at(b, 0, b"MM\x00*"):
        return ("image/tiff", "tif")
    if _at(b, 0, b"%PDF-"):
        return ("application/pdf", "pdf")
    if _at(b, 0, b"PK\x03\x04") or _at(b, 0, b"PK\x05\x06"):
        return ("application/zip", "zip")
    if _at(b, 0, b"\x1f\x8b"):
        return ("application/gzip", "gz")
    if _at(b, 0, b"7z\xbc\xaf\x27\x1c"):
        return ("application/x-7z-compressed", "7z")
    if _at(b, 0, b"Rar!\x1a\x07"):
        return ("application/vnd.rar", "rar")
    if _at(b, 0, b"SQLite format 3\x00"):
        return ("application/vnd.sqlite3", "sqlite")
    if _at(b, 0, b"\x00asm"):
        return ("application/wasm", "wasm")
    if _at(b, 0, b"OggS"):
        return ("audio/ogg", "ogg")
    if _at(b, 0, b"fLaC"):
        return ("audio/flac", "flac")
    if _at(b, 0, b"ID3") or (len(b) >= 2 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0 and (b[1] & 0x06) != 0):
        return ("audio/mpeg", "mp3")
    if _at(b, 0, b"\x1aE\xdf\xa3"):
        return ("video/webm", "webm")
    if _at(b, 4, b"ftyp") and len(b) >= 12:
        return _FTYP.get(b[8:12], ("video/mp4", "mp4"))
    if _at(b, 0, b"wOFF"):
        return ("font/woff", "woff")
    if _at(b, 0, b"wOF2"):
        return ("font/woff2", "woff2")
    return None


def matches_extension(data: bytes, filename: str) -> bool:
    """True when the detected type agrees with the file name's extension (case-insensitive)."""
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    ext = _ALIASES.get(ext, ext)
    found = detect_file_type(data)
    if found is None:
        return False
    if found[1] == "zip":
        return ext in _ZIP_EXTENSIONS
    if found[1] == "heic":
        return ext in ("heic", "heif")
    return ext == found[1]
