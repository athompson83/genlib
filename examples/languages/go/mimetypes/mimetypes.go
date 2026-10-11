// SPDX-License-Identifier: Apache-2.0

// Package mimetypes maps file extensions to MIME types and back for common web
// and document formats. Lookup is case-insensitive on the text after the last
// '.'; a name without '.' is itself the extension ("json"). The first table row
// for a type is its canonical extension.
package mimetypes

import "strings"

// table lists (extension, type) rows; order matters for canonical extensions.
var table = [][2]string{
	{"html", "text/html"}, {"htm", "text/html"}, {"css", "text/css"}, {"js", "text/javascript"},
	{"mjs", "text/javascript"}, {"cjs", "text/javascript"}, {"json", "application/json"},
	{"map", "application/json"}, {"jsonld", "application/ld+json"},
	{"webmanifest", "application/manifest+json"}, {"xml", "application/xml"}, {"txt", "text/plain"},
	{"text", "text/plain"}, {"log", "text/plain"}, {"md", "text/markdown"}, {"markdown", "text/markdown"},
	{"csv", "text/csv"}, {"tsv", "text/tab-separated-values"}, {"ics", "text/calendar"}, {"vcf", "text/vcard"},
	{"yaml", "application/yaml"}, {"yml", "application/yaml"}, {"toml", "application/toml"},
	{"png", "image/png"}, {"jpg", "image/jpeg"}, {"jpeg", "image/jpeg"}, {"gif", "image/gif"},
	{"webp", "image/webp"}, {"avif", "image/avif"}, {"svg", "image/svg+xml"},
	{"ico", "image/vnd.microsoft.icon"}, {"bmp", "image/bmp"}, {"tif", "image/tiff"}, {"tiff", "image/tiff"},
	{"heic", "image/heic"}, {"mp3", "audio/mpeg"}, {"wav", "audio/wav"}, {"ogg", "audio/ogg"},
	{"oga", "audio/ogg"}, {"m4a", "audio/mp4"}, {"flac", "audio/flac"}, {"weba", "audio/webm"},
	{"opus", "audio/opus"}, {"mp4", "video/mp4"}, {"m4v", "video/mp4"}, {"webm", "video/webm"},
	{"ogv", "video/ogg"}, {"mov", "video/quicktime"}, {"avi", "video/x-msvideo"}, {"mpeg", "video/mpeg"},
	{"woff", "font/woff"}, {"woff2", "font/woff2"}, {"ttf", "font/ttf"}, {"otf", "font/otf"},
	{"pdf", "application/pdf"}, {"zip", "application/zip"}, {"gz", "application/gzip"},
	{"tar", "application/x-tar"}, {"7z", "application/x-7z-compressed"}, {"rar", "application/vnd.rar"},
	{"bz2", "application/x-bzip2"}, {"doc", "application/msword"},
	{"docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
	{"xls", "application/vnd.ms-excel"},
	{"xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
	{"ppt", "application/vnd.ms-powerpoint"},
	{"pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"},
	{"odt", "application/vnd.oasis.opendocument.text"},
	{"ods", "application/vnd.oasis.opendocument.spreadsheet"},
	{"odp", "application/vnd.oasis.opendocument.presentation"}, {"rtf", "application/rtf"},
	{"epub", "application/epub+zip"}, {"wasm", "application/wasm"}, {"bin", "application/octet-stream"},
	{"exe", "application/vnd.microsoft.portable-executable"}, {"sh", "application/x-sh"},
	{"apk", "application/vnd.android.package-archive"}, {"jar", "application/java-archive"},
	{"swf", "application/x-shockwave-flash"},
}

var textExtra = map[string]bool{"application/json": true, "application/ld+json": true, "application/manifest+json": true, "application/toml": true, "application/xml": true, "application/yaml": true, "image/svg+xml": true, "text/javascript": true}

var byExt, byType = func() (map[string]string, map[string]string) {
	e, t := map[string]string{}, map[string]string{}
	for _, r := range table {
		e[r[0]] = r[1]
		if _, ok := t[r[1]]; !ok {
			t[r[1]] = r[0]
		}
	}
	return e, t
}()

// TypeFor returns the MIME type for a file name or bare extension, and false when unknown.
func TypeFor(name string) (string, bool) {
	ext := name
	if i := strings.LastIndexByte(name, '.'); i >= 0 {
		ext = name[i+1:]
	}
	t, ok := byExt[strings.ToLower(ext)]
	return t, ok
}

// ExtensionFor returns the canonical extension for a MIME type (parameters and case ignored), and false when unknown.
func ExtensionFor(mime string) (string, bool) {
	base := mime
	if i := strings.IndexByte(mime, ';'); i >= 0 {
		base = mime[:i]
	}
	e, ok := byType[strings.ToLower(strings.TrimSpace(base))]
	return e, ok
}

// ContentTypeFor returns a Content-Type value for a file name, with "; charset=utf-8" for text types and application/octet-stream when unknown.
func ContentTypeFor(name string) string {
	t, ok := TypeFor(name)
	if !ok {
		return "application/octet-stream"
	}
	if strings.HasPrefix(t, "text/") || textExtra[t] {
		return t + "; charset=utf-8"
	}
	return t
}
