// SPDX-License-Identifier: Apache-2.0

package cursors

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

var (
	secret = []byte("0123456789abcdef0123456789abcdef")
	values = []string{"2026-10-01T12:00:00Z", "42"}
)

const token = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc"

func TestVector(t *testing.T) {
	if got, err := Encode(values, secret, 1790000000); err != nil || got != token {
		t.Fatalf("got %q err %v", got, err)
	}
	if got, err := Decode(token, secret, 1789999999); err != nil || !reflect.DeepEqual(got, values) {
		t.Fatalf("got %v err %v", got, err)
	}
}

func expectKind(t *testing.T, tok string, key []byte, now int64, kind error) {
	t.Helper()
	_, err := Decode(tok, key, now)
	if !errors.Is(err, kind) || !strings.HasPrefix(err.Error(), kind.Error()) {
		t.Fatalf("%q: want %v, got %v", tok, kind, err)
	}
}

func TestFailures(t *testing.T) {
	expectKind(t, token, secret, 1790000000, ErrExpired)
	last := "A"
	if strings.HasSuffix(token, "A") {
		last = "B"
	}
	expectKind(t, token[:len(token)-1]+last, secret, 0, ErrBadSignature)
	expectKind(t, token[:len(token)-1]+"d", secret, 0, ErrBadSignature) // only unused bits differ
	expectKind(t, strings.Replace(token, ".", "", 1), secret, 0, ErrMalformed)
	expectKind(t, token, []byte(strings.Repeat("x", 32)), 0, ErrBadSignature)
	expectKind(t, token+"=", secret, 0, ErrMalformed)
	expectKind(t, token[strings.LastIndexByte(token, '.'):], secret, 0, ErrMalformed)
	expectKind(t, strings.Replace(token, "d", "+", 1), secret, 0, ErrMalformed)
}

func TestValidation(t *testing.T) {
	if _, err := Encode(values, secret[:31], 1790000000); err == nil {
		t.Fatal("encode accepted a 31-byte secret")
	}
	if _, err := Decode(token, secret[:31], 0); err == nil {
		t.Fatal("decode accepted a 31-byte secret")
	}
	for _, v := range [][]string{nil, {"a\nb"}, make([]string, 17)} {
		if _, err := Encode(v, secret, 1); err == nil {
			t.Fatalf("accepted %q", v)
		}
	}
	if _, err := Encode(values, secret, 0); err == nil {
		t.Fatal("accepted expiresAt 0")
	}
}
