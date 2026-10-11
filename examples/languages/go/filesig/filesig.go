// SPDX-License-Identifier: Apache-2.0

// Package filesig detects file types from leading bytes (magic numbers) for
// upload checks. Detection is a first check, not a malware scan: still
// re-encode or sandbox untrusted files.
package filesig

import (
	"bytes"
	"strings"
)

// FileType is a detected MIME type and its canonical extension.
type FileType struct {
	MIME, Extension string
}

func at(b []byte, off int, sig string) bool {
	return len(b) >= off+len(sig) && bytes.Equal(b[off:off+len(sig)], []byte(sig))
}

var ftyp = map[string]FileType{
	"avif": {"image/avif", "avif"}, "avis": {"image/avif", "avif"}, "heic": {"image/heic", "heic"}, "heix": {"image/heic", "heic"},
	"mif1": {"image/heif", "heif"}, "msf1": {"image/heif", "heif"}, "qt  ": {"video/quicktime", "mov"}, "M4A ": {"audio/mp4", "m4a"},
	"3gp4": {"video/3gpp", "3gp"}, "3gp5": {"video/3gpp", "3gp"},
}

// DetectFileType returns the recognised type from at most the first 64 bytes; ok is false when unknown. Not a malware scan.
func DetectFileType(data []byte) (FileType, bool) {
	b := data
	if len(b) > 64 {
		b = b[:64]
	}
	t := func(m, e string) (FileType, bool) { return FileType{m, e}, true }
	switch {
	case at(b, 0, "\x89PNG\r\n\x1a\n"):
		return t("image/png", "png")
	case at(b, 0, "\xff\xd8\xff"):
		return t("image/jpeg", "jpg")
	case at(b, 0, "GIF87a") || at(b, 0, "GIF89a"):
		return t("image/gif", "gif")
	case at(b, 0, "RIFF") && at(b, 8, "WEBP"):
		return t("image/webp", "webp")
	case at(b, 0, "RIFF") && at(b, 8, "WAVE"):
		return t("audio/wav", "wav")
	case at(b, 0, "RIFF") && at(b, 8, "AVI "):
		return t("video/x-msvideo", "avi")
	case at(b, 0, "BM") && len(b) >= 14:
		return t("image/bmp", "bmp")
	case at(b, 0, "\x00\x00\x01\x00"):
		return t("image/x-icon", "ico")
	case at(b, 0, "II*\x00") || at(b, 0, "MM\x00*"):
		return t("image/tiff", "tif")
	case at(b, 0, "%PDF-"):
		return t("application/pdf", "pdf")
	case at(b, 0, "PK\x03\x04") || at(b, 0, "PK\x05\x06"):
		return t("application/zip", "zip")
	case at(b, 0, "\x1f\x8b"):
		return t("application/gzip", "gz")
	case at(b, 0, "7z\xbc\xaf\x27\x1c"):
		return t("application/x-7z-compressed", "7z")
	case at(b, 0, "Rar!\x1a\x07"):
		return t("application/vnd.rar", "rar")
	case at(b, 0, "SQLite format 3\x00"):
		return t("application/vnd.sqlite3", "sqlite")
	case at(b, 0, "\x00asm"):
		return t("application/wasm", "wasm")
	case at(b, 0, "OggS"):
		return t("audio/ogg", "ogg")
	case at(b, 0, "fLaC"):
		return t("audio/flac", "flac")
	case at(b, 0, "ID3") || (len(b) >= 2 && b[0] == 0xFF && b[1]&0xE0 == 0xE0 && b[1]&0x06 != 0):
		return t("audio/mpeg", "mp3")
	case at(b, 0, "\x1aE\xdf\xa3"):
		return t("video/webm", "webm")
	case at(b, 4, "ftyp") && len(b) >= 12:
		if ft, ok := ftyp[string(b[8:12])]; ok {
			return ft, true
		}
		return t("video/mp4", "mp4")
	case at(b, 0, "wOFF"):
		return t("font/woff", "woff")
	case at(b, 0, "wOF2"):
		return t("font/woff2", "woff2")
	}
	return FileType{}, false
}

var aliases = map[string]string{"jpeg": "jpg", "jpe": "jpg", "tiff": "tif", "htm": "html", "mpeg": "mp3"}

// MatchesExtension reports whether the detected type agrees with filename's extension (case-insensitive; zip containers such as docx match zip content).
func MatchesExtension(data []byte, filename string) bool {
	i := strings.LastIndexByte(filename, '.')
	if i < 0 {
		return false
	}
	ext := strings.ToLower(filename[i+1:])
	if a, ok := aliases[ext]; ok {
		ext = a
	}
	t, ok := DetectFileType(data)
	if !ok {
		return false
	}
	switch t.Extension {
	case "zip":
		switch ext {
		case "zip", "docx", "xlsx", "pptx", "odt", "ods", "odp", "jar", "apk", "epub":
			return true
		}
		return false
	case "heic":
		return ext == "heic" || ext == "heif"
	}
	return ext == t.Extension
}
