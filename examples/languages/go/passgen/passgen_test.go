// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package passgen

import (
	"encoding/hex"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func source(t *testing.T, h string) func() byte {
	t.Helper()
	b, err := hex.DecodeString(h)
	if err != nil || len(b) == 0 {
		t.Fatalf("bad source %q", h)
	}
	i := 0
	return func() byte {
		v := b[i%len(b)]
		i++
		return v
	}
}

func TestRandomIndex(t *testing.T) {
	for _, c := range []struct {
		n    int
		seed string
		want []int
	}{
		{10, "00ff10a37c55e2019b", []int{0, 6, 3, 4, 5, 6}},
		{300, "ffff0102a0b0", []int{258, 36, 258, 36, 258, 36}},
		{1, "00", []int{0, 0, 0, 0, 0, 0}},
		{256, "ab", []int{171, 171, 171, 171, 171, 171}},
		{62, "f0f8fc00", []int{54, 0, 54, 0, 54, 0}},
	} {
		src := source(t, c.seed)
		var got []int
		for range c.want {
			v, err := RandomIndex(c.n, src)
			if err != nil {
				t.Fatal(err)
			}
			got = append(got, v)
		}
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("RandomIndex(%d, %s) = %v; want %v", c.n, c.seed, got, c.want)
		}
	}
	if _, err := RandomIndex(0, source(t, "00")); !errors.Is(err, ErrPassGen) {
		t.Error("RandomIndex(0) should fail")
	}
}

func TestGeneratePassword(t *testing.T) {
	for _, c := range []struct {
		length  int
		classes []string
		noAmb   bool
		seed    string
		want    string
	}{
		{16, []string{"lower", "upper", "digits", "symbols"}, false, "00ff10a37c55e2019b", "jl__j_ad3WbbdqQa"},
		{12, []string{"lower", "digits"}, true, "0102030405060708090a0b0c0d0e0f", "hkjibfmdnge4"},
		{4, []string{"upper", "lower", "digits", "symbols"}, false, "7f", "X7x#"},
		{20, []string{"symbols"}, false, "ffffffffffffffff00", "!!!!!!!!!!!!!!!!!!!!"},
	} {
		got, err := GeneratePassword(c.length, c.classes, source(t, c.seed), c.noAmb)
		if err != nil || got != c.want {
			t.Errorf("GeneratePassword(%d, %v, %v, %s) = %q, %v; want %q", c.length, c.classes, c.noAmb, c.seed, got, err, c.want)
		}
	}
	for _, c := range []struct {
		length  int
		classes []string
	}{
		{3, []string{"lower", "upper", "digits", "symbols"}},
		{8, []string{}},
		{8, []string{"lower", "lower"}},
		{8, []string{"emoji"}},
		{1025, []string{"lower"}},
	} {
		if _, err := GeneratePassword(c.length, c.classes, source(t, "00"), false); !errors.Is(err, ErrPassGen) {
			t.Errorf("GeneratePassword(%d, %v) error = %v", c.length, c.classes, err)
		}
	}
}

func TestGeneratePassphrase(t *testing.T) {
	for _, c := range []struct {
		words     []string
		count     int
		separator string
		seed      string
		want      string
	}{
		{[]string{"apple", "river", "stone", "cloud", "maple"}, 4, "-", "0102030405", "river-stone-cloud-maple"},
		{[]string{"a", "b"}, 3, " ", "ff00", "b a b"},
	} {
		got, err := GeneratePassphrase(c.words, c.count, c.separator, source(t, c.seed))
		if err != nil || got != c.want {
			t.Errorf("GeneratePassphrase(%v, %d) = %q, %v; want %q", c.words, c.count, got, err, c.want)
		}
	}
	for _, c := range []struct {
		words []string
		count int
	}{
		{[]string{"a"}, 3},
		{[]string{"a", "b"}, 0},
		{[]string{"a", "b"}, 65},
		{[]string{"a", ""}, 2},
	} {
		if _, err := GeneratePassphrase(c.words, c.count, "-", source(t, "00")); !errors.Is(err, ErrPassGen) {
			t.Errorf("GeneratePassphrase(%v, %d) error = %v", c.words, c.count, err)
		}
	}
}

func TestEntropyBits(t *testing.T) {
	for _, c := range []struct {
		size, length int
		want         float64
	}{
		{76, 16, 99.97},
		{10, 6, 19.93},
		{7776, 5, 64.62},
		{2, 1, 1.0},
	} {
		if got, err := EntropyBits(c.size, c.length); err != nil || got != c.want {
			t.Errorf("EntropyBits(%d, %d) = %v, %v; want %v", c.size, c.length, got, err, c.want)
		}
	}
}

func TestCSPRNG(t *testing.T) {
	p, err := Password(24, DefaultClasses, true)
	if err != nil || len(p) != 24 || strings.ContainsAny(p, "Il1O0o") {
		t.Errorf("Password = %q, %v", p, err)
	}
	if s, err := Passphrase([]string{"a", "b", "c"}, 6, "-"); err != nil || len(s) != 11 {
		t.Errorf("Passphrase = %q, %v", s, err)
	}
}
