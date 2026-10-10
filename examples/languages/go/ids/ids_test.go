// SPDX-License-Identifier: Apache-2.0

package ids

import (
	"bytes"
	"regexp"
	"testing"
)

var r10 = []byte{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

const ms = int64(1790000000123)

func TestVectors(t *testing.T) {
	cases := []struct {
		got  func() (string, error)
		want string
	}{
		{func() (string, error) { return UUIDv7(ms, r10) }, "01a0c450-6c7b-7102-8304-05060708090a"},
		{func() (string, error) { return ULID(ms, r10) }, "01M3250V3V041061050R3GG28A"},
		{func() (string, error) { return UUIDv7(0, make([]byte, 10)) }, "00000000-0000-7000-8000-000000000000"},
		{func() (string, error) { return ULID(MaxUnixMs, bytes.Repeat([]byte{0xFF}, 10)) }, "7ZZZZZZZZZZZZZZZZZZZZZZZZZ"},
	}
	for _, c := range cases {
		if got, err := c.got(); err != nil || got != c.want {
			t.Fatalf("got %q err %v want %q", got, err, c.want)
		}
	}
}

func TestRoundTrip(t *testing.T) {
	for text, want := range map[string]int64{
		"01a0c450-6c7b-7102-8304-05060708090a": ms, "01A0C450-6C7B-7102-8304-05060708090A": ms,
		"00000000-0000-7000-8000-000000000000": 0,
	} {
		if got, err := UUIDv7Time(text); err != nil || got != want {
			t.Fatalf("%s: %d %v", text, got, err)
		}
	}
	for text, want := range map[string]int64{
		"01M3250V3V041061050R3GG28A": ms, "01m3250v3v041061050r3gg28a": ms, "7ZZZZZZZZZZZZZZZZZZZZZZZZZ": MaxUnixMs,
	} {
		if got, err := ULIDTime(text); err != nil || got != want {
			t.Fatalf("%s: %d %v", text, got, err)
		}
	}
}

func TestValidation(t *testing.T) {
	if _, err := UUIDv7(-1, r10); err == nil {
		t.Fatal("negative time accepted")
	}
	if _, err := ULID(MaxUnixMs+1, r10); err == nil {
		t.Fatal("49-bit time accepted")
	}
	if _, err := ULID(ms, r10[:9]); err == nil {
		t.Fatal("9 random bytes accepted")
	}
	for _, bad := range []string{"01a0c450-6c7b-6102-8304-05060708090a", "01a0c450-6c7b-7102-c304-05060708090a",
		"01a0c450-6c7b-7102-8304-05060708090", "01a0c450x6c7b-7102-8304-05060708090a", "01a0c450-6c7b-7102-8304-05060708090g"} {
		if _, err := UUIDv7Time(bad); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	for _, bad := range []string{"81M3250V3V041061050R3GG28A", "01M3250V3V041061050R3GG28", "01M3250V3V041061050R3GG28U"} {
		if _, err := ULIDTime(bad); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}

func TestRandom(t *testing.T) {
	a, _ := NewUUIDv7()
	b, _ := NewUUIDv7()
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(a) || a == b {
		t.Fatalf("%s %s", a, b)
	}
	c, _ := NewULID()
	d, _ := NewULID()
	if !regexp.MustCompile(`^[0-7][0-9A-HJKMNP-TV-Z]{25}$`).MatchString(c) || c == d {
		t.Fatalf("%s %s", c, d)
	}
}
