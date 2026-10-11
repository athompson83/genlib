// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package roman

import (
	"errors"
	"testing"
)

func TestToRoman(t *testing.T) {
	for _, c := range []struct {
		n    int
		want string
	}{
		{1, "I"},
		{4, "IV"},
		{9, "IX"},
		{14, "XIV"},
		{40, "XL"},
		{90, "XC"},
		{400, "CD"},
		{1994, "MCMXCIV"},
		{2026, "MMXXVI"},
		{3888, "MMMDCCCLXXXVIII"},
		{3999, "MMMCMXCIX"},
	} {
		got, err := ToRoman(c.n)
		if err != nil || got != c.want {
			t.Errorf("ToRoman(%d) = %q, %v; want %q", c.n, got, err, c.want)
		}
	}
}

func TestFromRoman(t *testing.T) {
	for _, c := range []struct {
		s    string
		want int
	}{
		{"I", 1},
		{"iv", 4},
		{"MCMXCIV", 1994},
		{"mmxxvi", 2026},
		{"MMMCMXCIX", 3999},
	} {
		got, err := FromRoman(c.s)
		if err != nil || got != c.want {
			t.Errorf("FromRoman(%q) = %d, %v; want %d", c.s, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, n := range []int{0, 4000, -5} {
		if _, err := ToRoman(n); !errors.Is(err, ErrRoman) {
			t.Errorf("ToRoman(%d) error = %v", n, err)
		}
	}
	for _, s := range []string{"", "IIII", "IC", "VX", "MMMM", "ABC", "IIV", "XM"} {
		if _, err := FromRoman(s); !errors.Is(err, ErrRoman) {
			t.Errorf("FromRoman(%q) error = %v", s, err)
		}
	}
}
