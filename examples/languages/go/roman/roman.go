// SPDX-License-Identifier: Apache-2.0

// Package roman converts integers 1..3999 to standard subtractive Roman
// numerals and back. Parsing is case-insensitive and accepts only the
// canonical form, so "IIII", "IC" and "VX" are rejected.
package roman

import (
	"errors"
	"strings"
)

// ErrRoman is returned for out-of-range numbers and non-canonical numerals.
var ErrRoman = errors.New("roman: invalid numeral or out of range")

var pairs = []struct {
	v int
	s string
}{
	{1000, "M"}, {900, "CM"}, {500, "D"}, {400, "CD"}, {100, "C"}, {90, "XC"},
	{50, "L"}, {40, "XL"}, {10, "X"}, {9, "IX"}, {5, "V"}, {4, "IV"}, {1, "I"},
}

var values = map[rune]int{'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}

// ToRoman returns the canonical numeral for n in 1..3999.
func ToRoman(n int) (string, error) {
	if n < 1 || n > 3999 {
		return "", ErrRoman
	}
	var b strings.Builder
	for _, p := range pairs {
		for n >= p.v {
			b.WriteString(p.s)
			n -= p.v
		}
	}
	return b.String(), nil
}

// FromRoman parses a canonical numeral (any case) and returns its value.
func FromRoman(s string) (int, error) {
	u := []rune(strings.ToUpper(s))
	if len(u) == 0 {
		return 0, ErrRoman
	}
	total := 0
	for i, c := range u {
		v, ok := values[c]
		if !ok {
			return 0, ErrRoman
		}
		if i+1 < len(u) && values[u[i+1]] > v {
			total -= v
		} else {
			total += v
		}
	}
	if total < 1 || total > 3999 {
		return 0, ErrRoman
	}
	if r, _ := ToRoman(total); r != string(u) {
		return 0, ErrRoman
	}
	return total, nil
}
