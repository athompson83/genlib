// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package piimask

import (
	"errors"
	"testing"
)

func TestMaskEmail(t *testing.T) {
	for _, c := range [][2]string{
		{"jane.doe@example.com", "j*******@example.com"},
		{"a@b.co", "a***@b.co"},
		{"ab@x.io", "a***@x.io"},
		{"\u00e9mile@ex.fr", "\u00e9****@ex.fr"},
	} {
		got, err := MaskEmail(c[0])
		if err != nil || got != c[1] {
			t.Errorf("MaskEmail(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestMaskPhone(t *testing.T) {
	for _, c := range [][2]string{
		{"+1 (415) 555-0123", "+1 (***) ***-0123"},
		{"+44 20 7946 0958", "+44 ** **** 0958"},
		{"0612345678", "******5678"},
		{"555-0123-99", "***-**23-99"},
	} {
		got, err := MaskPhone(c[0])
		if err != nil || got != c[1] {
			t.Errorf("MaskPhone(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestMaskCard(t *testing.T) {
	for _, c := range [][2]string{
		{"4111 1111 1111 1111", "**** **** **** 1111"},
		{"4111-1111-1111-1111", "****-****-****-1111"},
		{"378282246310005", "***********0005"},
		{"6011000990139424", "************9424"},
	} {
		got, err := MaskCard(c[0])
		if err != nil || got != c[1] {
			t.Errorf("MaskCard(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestMaskMiddle(t *testing.T) {
	for _, c := range []struct {
		s          string
		start, end int
		want       string
	}{
		{"secret-token", 2, 2, "se********en"},
		{"abc", 1, 1, "a*c"},
		{"ab", 1, 1, "**"},
		{"password", 0, 0, "********"},
		{"h\u00e9llo", 1, 0, "h****"},
	} {
		got, err := MaskMiddle(c.s, c.start, c.end, "*")
		if err != nil || got != c.want {
			t.Errorf("MaskMiddle(%q, %d, %d) = %q, %v; want %q", c.s, c.start, c.end, got, err, c.want)
		}
	}
	for _, bad := range []struct {
		start, end int
		mask       string
	}{{-1, 1, "*"}, {1, -1, "*"}, {1, 1, ""}, {1, 1, "**"}} {
		if _, err := MaskMiddle("secret", bad.start, bad.end, bad.mask); !errors.Is(err, ErrPII) {
			t.Errorf("MaskMiddle(%v) error = %v", bad, err)
		}
	}
}

func TestRedact(t *testing.T) {
	for _, c := range [][2]string{
		{"contact jane@example.com today", "contact j***@example.com today"},
		{"card 4111 1111 1111 1111 exp", "card **** **** **** 1111 exp"},
		{"order 1234 5678 9012 3456 ok", "order 1234 5678 9012 3456 ok"},
		{"two a@b.io, c.d@e.org", "two a***@b.io, c***@e.org"},
		{"id 4111111111111111x", "id ************1111x"},
	} {
		if got := Redact(c[0]); got != c[1] {
			t.Errorf("Redact(%q) = %q; want %q", c[0], got, c[1])
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"nope", "a@b@c", "@x.com", "x@"} {
		if _, err := MaskEmail(s); !errors.Is(err, ErrPII) {
			t.Errorf("MaskEmail(%q) error = %v", s, err)
		}
	}
	for _, s := range []string{"123", "+1 55"} {
		if _, err := MaskPhone(s); !errors.Is(err, ErrPII) {
			t.Errorf("MaskPhone(%q) error = %v", s, err)
		}
	}
	for _, s := range []string{"4111", "4111 1111 1111 1111 1111 1", "4111a1111111111"} {
		if _, err := MaskCard(s); !errors.Is(err, ErrPII) {
			t.Errorf("MaskCard(%q) error = %v", s, err)
		}
	}
}
