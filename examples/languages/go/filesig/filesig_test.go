// SPDX-License-Identifier: Apache-2.0

package filesig

import (
	"encoding/hex"
	"testing"
)

func unhex(t *testing.T, s string) []byte {
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestDetect(t *testing.T) {
	for _, c := range []struct {
		name, hex, mime, ext string
		ok                   bool
	}{
		{"png", "89504e470d0a1a0a0000000d49484452", "image/png", "png", true},
		{"jpg", "ffd8ffe000104a464946", "image/jpeg", "jpg", true},
		{"gif", "4749463839610100", "image/gif", "gif", true},
		{"webp", "52494646240000005745425056503820", "image/webp", "webp", true},
		{"wav", "524946462400000057415645666d7420", "audio/wav", "wav", true},
		{"avi", "5249464624000000415649204c495354", "video/x-msvideo", "avi", true},
		{"bmp", "424d0000000000000000000000000000", "image/bmp", "bmp", true},
		{"ico", "000001000100", "image/x-icon", "ico", true},
		{"tif", "49492a000800", "image/tiff", "tif", true},
		{"tif-be", "4d4d002a0008", "image/tiff", "tif", true},
		{"pdf", "255044462d312e370a", "application/pdf", "pdf", true},
		{"zip", "504b03041400", "application/zip", "zip", true},
		{"zip-empty", "504b0506000000000000000000000000000000000000", "application/zip", "zip", true},
		{"gz", "1f8b0800", "application/gzip", "gz", true},
		{"7z", "377abcaf271c0004", "application/x-7z-compressed", "7z", true},
		{"rar", "526172211a070100", "application/vnd.rar", "rar", true},
		{"sqlite", "53514c69746520666f726d61742033001000", "application/vnd.sqlite3", "sqlite", true},
		{"wasm", "0061736d01000000", "application/wasm", "wasm", true},
		{"ogg", "4f6767530002", "audio/ogg", "ogg", true},
		{"flac", "664c614300000022", "audio/flac", "flac", true},
		{"mp3-id3", "494433040000", "audio/mpeg", "mp3", true},
		{"mp3-frame", "fffb9064", "audio/mpeg", "mp3", true},
		{"webm", "1a45dfa39f4286", "video/webm", "webm", true},
		{"mp4", "000000206674797069736f6d00000200", "video/mp4", "mp4", true},
		{"mov", "00000014667479707174202000000000", "video/quicktime", "mov", true},
		{"heic", "00000018667479706865696300000000", "image/heic", "heic", true},
		{"avif", "0000001c667479706176696600000000", "image/avif", "avif", true},
		{"m4a", "00000020667479704d34412000000000", "audio/mp4", "m4a", true},
		{"woff", "774f464600010000", "font/woff", "woff", true},
		{"woff2", "774f463200010000", "font/woff2", "woff2", true},
		{"text", "68656c6c6f20776f726c64", "", "", false},
		{"empty", "", "", "", false},
		{"short-png", "89504e47", "", "", false},
		{"bm-short", "424d0000", "", "", false},
		{"ff-not-mp3", "ffe10000", "", "", false},
		{"html", "3c21444f43545950452068746d6c3e", "", "", false},
	} {
		got, ok := DetectFileType(unhex(t, c.hex))
		if ok != c.ok || got.MIME != c.mime || got.Extension != c.ext {
			t.Errorf("%s: DetectFileType = %v %v", c.name, got, ok)
		}
	}
}

func TestExtension(t *testing.T) {
	for _, c := range []struct {
		hex, filename string
		want          bool
	}{
		{"89504e470d0a1a0a0000000d49484452", "a.png", true},
		{"89504e470d0a1a0a0000000d49484452", "a.PNG", true},
		{"89504e470d0a1a0a0000000d49484452", "a.jpg", false},
		{"ffd8ffe000104a464946", "photo.jpeg", true},
		{"504b03041400", "report.docx", true},
		{"504b03041400", "x.xlsx", true},
		{"255044462d312e370a", "x.pdf.exe", false},
		{"00000018667479706865696300000000", "IMG_1.HEIF", true},
		{"68656c6c6f20776f726c64", "a.txt", false},
		{"89504e470d0a1a0a0000000d49484452", "noext", false},
		{"49492a000800", "scan.tiff", true},
		{"494433040000", "song.mp3", true},
		{"1f8b0800", "a.tar.gz", true},
	} {
		if got := MatchesExtension(unhex(t, c.hex), c.filename); got != c.want {
			t.Errorf("MatchesExtension(%s, %s) = %v", c.hex, c.filename, got)
		}
	}
}
