// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package mimetypes

import (
	"testing"
)

func TestTypeFor(t *testing.T) {
	for _, c := range []struct {
		name, want string
		ok         bool
	}{
		{"index.html", "text/html", true},
		{"APP.JS", "text/javascript", true},
		{"data.json", "application/json", true},
		{"photo.JPG", "image/jpeg", true},
		{"x.tar.gz", "application/gzip", true},
		{"video.webm", "video/webm", true},
		{"font.woff2", "font/woff2", true},
		{"doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", true},
		{"noext", "", false},
		{"json", "application/json", true},
		{".png", "image/png", true},
		{"a.unknown", "", false},
		{"style.css", "text/css", true},
		{"feed.xml", "application/xml", true},
		{"pic.svg", "image/svg+xml", true},
	} {
		if got, ok := TypeFor(c.name); got != c.want || ok != c.ok {
			t.Errorf("TypeFor(%q) = %q, %v", c.name, got, ok)
		}
	}
}

func TestExtensionFor(t *testing.T) {
	for _, c := range []struct {
		mime, want string
		ok         bool
	}{
		{"image/jpeg", "jpg", true},
		{"text/html; charset=UTF-8", "html", true},
		{"Application/JSON", "json", true},
		{"text/javascript", "js", true},
		{"application/x-unknown", "", false},
		{"video/mp4", "mp4", true},
	} {
		if got, ok := ExtensionFor(c.mime); got != c.want || ok != c.ok {
			t.Errorf("ExtensionFor(%q) = %q, %v", c.mime, got, ok)
		}
	}
}

func TestContentTypeFor(t *testing.T) {
	for _, c := range [][2]string{
		{"a.html", "text/html; charset=utf-8"},
		{"a.json", "application/json; charset=utf-8"},
		{"a.png", "image/png"},
		{"a.svg", "image/svg+xml; charset=utf-8"},
		{"a.bin", "application/octet-stream"},
		{"a.zzz", "application/octet-stream"},
		{"readme.md", "text/markdown; charset=utf-8"},
	} {
		if got := ContentTypeFor(c[0]); got != c[1] {
			t.Errorf("ContentTypeFor(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}
