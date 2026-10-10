// SPDX-License-Identifier: Apache-2.0

package saferedirect

import (
	"strings"
	"testing"
)

var allowed = []string{"https://app.example.com", "https://accounts.example.com:8443"}

func TestVectors(t *testing.T) {
	for _, c := range []struct {
		target, want string
	}{
		{"/dashboard?tab=1#top", "/dashboard?tab=1#top"},
		{"//evil.com/x", "/"},
		{"/\\evil.com", "/"},
		{"https://app.example.com/settings", "https://app.example.com/settings"},
		{"HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"},
		{"https://app.example.com.evil.com/", "/"},
		{"https://user@app.example.com/", "/"},
		{"http://app.example.com/", "/"},
		{"https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"},
		{"https://accounts.example.com/login", "/"},
		{"javascript:alert(1)", "/"},
		{"/ok path", "/"},
		{"dashboard", "/"},
		{"", "/"},
		{"/\t/evil.com", "/"},
		{"https://app.example.com:99999/", "/"},
	} {
		if got := SafeRedirect(c.target, allowed, "/"); got != c.want {
			t.Errorf("SafeRedirect(%q) = %q, want %q", c.target, got, c.want)
		}
	}
}

func TestEdges(t *testing.T) {
	long := "/" + strings.Repeat("a", MaxLength)
	for _, target := range []string{long, "/a\x7fb", "https://.example.com/", "https://app..example.com/", "ftp://app.example.com/"} {
		if got := SafeRedirect(target, allowed, "/home"); got != "/home" {
			t.Errorf("SafeRedirect(%q) = %q", target, got)
		}
	}
	if got := SafeRedirect("http://localhost:80/x", []string{"http://LOCALHOST"}, "/"); got != "http://localhost:80/x" {
		t.Errorf("default port not normalized: %q", got)
	}
}
