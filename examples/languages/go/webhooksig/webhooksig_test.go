// SPDX-License-Identifier: Apache-2.0

package webhooksig

import (
	"errors"
	"strings"
	"testing"
)

var (
	secret = []byte("whsec_test_secret_0123456789abcd")
	body   = []byte("{\"id\":\"evt_1\",\"amount\":1999}")
)

const (
	ts     = int64(1790000000)
	header = "t=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6"
	sig    = "ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6"
)

func TestSignVector(t *testing.T) {
	if got, err := Sign(secret, ts, body); err != nil || got != header {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestVerify(t *testing.T) {
	ok := []struct {
		header string
		now    int64
	}{
		{header, ts}, {header, ts + 300}, {header, ts - 300},
		{"t=1790000000,v1=" + strings.Repeat("0", 64) + ",v1=" + sig, ts},
		{" t = 1790000000 , v0=abc, v1 = " + sig + " ", ts},
	}
	for _, c := range ok {
		if got, err := Verify(c.header, body, secret, c.now, DefaultTolerance); err != nil || got != ts {
			t.Fatalf("%q at %d: %v", c.header, c.now, err)
		}
	}
	flipped := sig[:63] + "7"
	if sig[63] == '7' {
		flipped = sig[:63] + "8"
	}
	bad := []struct {
		header string
		body   []byte
		secret []byte
		now    int64
		want   error
	}{
		{header, body, secret, ts + 301, ErrExpired},
		{header, body, secret, ts - 301, ErrExpired},
		{header, []byte(strings.Replace(string(body), "1999", "1998", 1)), secret, ts, ErrBadSignature},
		{header, body, append([]byte("x"), secret...), ts, ErrBadSignature},
		{"t=1790000000,v1=" + flipped, body, secret, ts, ErrBadSignature},
		{"v1=" + sig, body, secret, ts, ErrMalformed},
		{"t=1,t=1790000000,v1=" + sig, body, secret, ts, ErrMalformed},
		{"t=1790000000,v1=" + sig[:63] + "z", body, secret, ts, ErrMalformed},
		{"t=1790000000,v1=" + strings.ToUpper(sig), body, secret, ts, ErrMalformed},
		{"t=1790000000", body, secret, ts, ErrMalformed},
		{"t=abc,v1=" + sig, body, secret, ts, ErrMalformed},
		{"garbage", body, secret, ts, ErrMalformed},
	}
	for _, c := range bad {
		if _, err := Verify(c.header, c.body, c.secret, c.now, DefaultTolerance); !errors.Is(err, c.want) {
			t.Fatalf("%q: got %v want %v", c.header, err, c.want)
		}
	}
}

func TestSecretRequired(t *testing.T) {
	if _, err := Sign(nil, ts, body); err == nil {
		t.Fatal("empty secret accepted by Sign")
	}
	if _, err := Verify(header, body, []byte{}, ts, DefaultTolerance); err == nil {
		t.Fatal("empty secret accepted by Verify")
	}
}
