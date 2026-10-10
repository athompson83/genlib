// SPDX-License-Identifier: Apache-2.0

package urlnormalize

import "testing"

func TestRemoveDotSegments(t *testing.T) {
	for _, c := range [][2]string{
		{"/a/b/c/./../../g", "/a/g"},
		{"mid/content=5/../6", "mid/6"},
		{"/../a", "/a"},
		{"/a/./b/.", "/a/b/"},
		{"/a/b/..", "/a/"},
		{".", ""},
		{"../x", "x"},
		{"/a//b/../c", "/a//c"},
	} {
		if got := RemoveDotSegments(c[0]); got != c[1] {
			t.Errorf("RemoveDotSegments(%q) = %q, want %q", c[0], got, c[1])
		}
	}
}

func TestNormalize(t *testing.T) {
	for _, c := range [][2]string{
		{"HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f", "http://example.com/~user/b?q=%2F"},
		{"https://example.com", "https://example.com/"},
		{"https://example.com:443/a%2Fb#frag", "https://example.com/a%2Fb"},
		{"http://example.com:8080/A/B/../C?", "http://example.com:8080/A/C"},
		{"https://[2001:DB8::0:1]:8443/x", "https://[2001:db8::1]:8443/x"},
		{"https://example.com/%e2%82%ac", "https://example.com/%E2%82%AC"},
		{"http://example.com:/p", "http://example.com/p"},
		{"https://EXAMPLE.com/a%20b", "https://example.com/a%20b"},
	} {
		got, err := Normalize(c[0])
		if err != nil || got != c[1] {
			t.Errorf("Normalize(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
	for _, u := range []string{"ftp://example.com/", "https://user@example.com/", "https://exa mple.com/", "//example.com/", "https://example.com/%zz", "https://example.com:99999/", "example.com/path", "https://[::g]/",
		"https://example.com:8a/", "https://[::1]x/", "https://example.com/%4", "https://exa_mple.com/"} {
		if got, err := Normalize(u); err == nil {
			t.Errorf("Normalize(%q) = %q, want error", u, got)
		}
	}
	if got, _ := Normalize("http://example.com:0080/%2e%2E/x"); got != "http://example.com/x" {
		t.Errorf("leading-zero port / encoded dots: %q", got)
	}
}
