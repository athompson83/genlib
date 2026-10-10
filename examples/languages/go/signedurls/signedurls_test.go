// SPDX-License-Identifier: Apache-2.0

package signedurls

import (
	"errors"
	"strings"
	"testing"
)

const secret = "url-signing-secret"

var cases = []struct {
	target  string
	expires int64
	signed  string
}{
	{"/files/report.pdf?user=42", 1790000000, "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"},
	{"/download/a%20b.zip", 1790003600, "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"},
}

func TestVectors(t *testing.T) {
	for _, c := range cases {
		got, err := SignURL(c.target, secret, c.expires)
		if err != nil || got != c.signed {
			t.Fatalf("SignURL(%q) = %q, %v", c.target, got, err)
		}
		if exp, err := VerifyURL(c.signed, secret, c.expires); err != nil || exp != c.expires {
			t.Fatalf("VerifyURL at expires: %d, %v", exp, err)
		}
		if _, err := VerifyURL(c.signed, secret, c.expires+1); !errors.Is(err, ErrExpired) {
			t.Fatalf("want expired, got %v", err)
		}
	}
}

func TestTampering(t *testing.T) {
	s := cases[0].signed
	now := cases[0].expires
	i := strings.LastIndex(s, "&signature=")
	sig := s[i+len("&signature="):]
	flip := "A"
	if sig[0] == 'A' {
		flip = "B"
	}
	bad := []struct {
		url, secret string
		want        error
	}{
		{strings.Replace(s, "report", "rep0rt", 1), secret, ErrBadSignature},
		{s, secret + "x", ErrBadSignature},
		{s[:i+len("&signature=")] + flip + sig[1:], secret, ErrBadSignature},
		{s[:i], secret, ErrMalformed},
		{strings.Replace(s, "&expires=", "&expires=1790000000&expires=", 1), secret, ErrMalformed},
		{strings.Replace(s, "expires=1790000000", "expires=17900000x0", 1), secret, ErrMalformed},
		{s + "x", secret, ErrMalformed},
		{"/no-query&signature=" + sig, secret, ErrMalformed},
	}
	for _, c := range bad {
		if _, err := VerifyURL(c.url, c.secret, now); !errors.Is(err, c.want) {
			t.Errorf("%q: got %v want %v", c.url, err, c.want)
		}
	}
}

func TestSignRejects(t *testing.T) {
	for _, c := range []struct {
		target, secret string
	}{
		{"/a", ""}, {"a", secret}, {"/a#frag", secret}, {"/a?expires=1", secret}, {"/a?x=1&signature=z", secret},
	} {
		if _, err := SignURL(c.target, c.secret, 1); err == nil {
			t.Errorf("SignURL(%q, %q) accepted", c.target, c.secret)
		}
	}
	if _, err := VerifyURL(cases[0].signed, "", 0); err == nil {
		t.Error("empty secret accepted by VerifyURL")
	}
}
