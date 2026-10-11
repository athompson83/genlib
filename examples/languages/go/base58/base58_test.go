// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package base58

import (
	"bytes"
	"encoding/hex"
	"errors"
	"testing"
)

func TestEncodeDecode(t *testing.T) {
	for _, c := range [][2]string{
		{"", ""},
		{"00", "1"},
		{"000001", "112"},
		{"68656c6c6f20776f726c64", "StV1DL6CwTryKyV"},
		{"00010203040506070809", "1kA3B2yGe2z4"},
		{"ffffffffffffffff", "jpXCZedGfVQ"},
		{"000068656c6c6f", "11Cn8eVZg"},
	} {
		raw, _ := hex.DecodeString(c[0])
		if got := Encode(raw); got != c[1] {
			t.Errorf("Encode(%s) = %q; want %q", c[0], got, c[1])
		}
		back, err := Decode(c[1])
		if err != nil || !bytes.Equal(back, raw) {
			t.Errorf("Decode(%q) = %x, %v; want %s", c[1], back, err, c[0])
		}
	}
}

func TestCheck(t *testing.T) {
	for _, c := range [][2]string{
		{"00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31", "1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs"},
		{"801111111111111111111111111111111111111111111111111111111111111111", "5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh"},
		{"", "3QJmnh"},
	} {
		raw, _ := hex.DecodeString(c[0])
		if got := CheckEncode(raw); got != c[1] {
			t.Errorf("CheckEncode(%s) = %q; want %q", c[0], got, c[1])
		}
		back, err := CheckDecode(c[1])
		if err != nil || !bytes.Equal(back, raw) {
			t.Errorf("CheckDecode(%q) = %x, %v; want %s", c[1], back, err, c[0])
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"0OIl", "abc+"} {
		if _, err := Decode(s); !errors.Is(err, ErrBase58) {
			t.Errorf("Decode(%q) error = %v", s, err)
		}
	}
	for _, s := range []string{"1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt", "1", ""} {
		if _, err := CheckDecode(s); !errors.Is(err, ErrBase58) {
			t.Errorf("CheckDecode(%q) error = %v", s, err)
		}
	}
}
