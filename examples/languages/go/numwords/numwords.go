// SPDX-License-Identifier: Apache-2.0

// Package numwords spells integers as US English words without "and"
// ("one hundred five", "forty-two"), with ordinal words, ordinal suffixes and
// currency amounts. Magnitudes must be below 10^15 (up to trillions).
package numwords

import (
	"errors"
	"strconv"
	"strings"
)

// ErrRange is returned for out-of-range numbers or bad money parameters.
var ErrRange = errors.New("numwords: number out of range")

var ones = []string{"zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
	"eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"}
var tens = []string{"", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"}
var scales = []string{"", "thousand", "million", "billion", "trillion"}

const limit = 1_000_000_000_000_000

func under1000(n int64) string {
	var parts []string
	if n >= 100 {
		parts = append(parts, ones[n/100]+" hundred")
		n %= 100
	}
	if n >= 20 {
		w := tens[n/10]
		if n%10 != 0 {
			w += "-" + ones[n%10]
		}
		parts = append(parts, w)
	} else if n > 0 {
		parts = append(parts, ones[n])
	}
	return strings.Join(parts, " ")
}

// NumberToWords spells n (|n| < 10^15) in words.
func NumberToWords(n int64) (string, error) {
	if n >= limit || n <= -limit {
		return "", ErrRange
	}
	if n == 0 {
		return "zero", nil
	}
	if n < 0 {
		w, _ := NumberToWords(-n)
		return "negative " + w, nil
	}
	var groups []string
	for i := 0; n > 0; i++ {
		if g := n % 1000; g != 0 {
			w := under1000(g)
			if scales[i] != "" {
				w += " " + scales[i]
			}
			groups = append([]string{w}, groups...)
		}
		n /= 1000
	}
	return strings.Join(groups, " "), nil
}

var irregular = map[string]string{"one": "first", "two": "second", "three": "third", "five": "fifth",
	"eight": "eighth", "nine": "ninth", "twelve": "twelfth"}

func ordinal(w string) string {
	if o, ok := irregular[w]; ok {
		return o
	}
	if strings.HasSuffix(w, "y") {
		return w[:len(w)-1] + "ieth"
	}
	return w + "th"
}

// OrdinalWords spells n >= 0 as an ordinal ("twenty-first", "one hundredth").
func OrdinalWords(n int64) (string, error) {
	if n < 0 {
		return "", ErrRange
	}
	w, err := NumberToWords(n)
	if err != nil {
		return "", err
	}
	words := strings.Split(w, " ")
	last := words[len(words)-1]
	if a, b, ok := strings.Cut(last, "-"); ok {
		last = a + "-" + ordinal(b)
	} else {
		last = ordinal(last)
	}
	words[len(words)-1] = last
	return strings.Join(words, " "), nil
}

// OrdinalSuffix returns n with its English suffix ("1st", "12th", "-22nd").
func OrdinalSuffix(n int64) string {
	a := uint64(n)
	if n < 0 {
		a = -a
	}
	s := "th"
	if m := a % 100; m < 11 || m > 13 {
		switch a % 10 {
		case 1:
			s = "st"
		case 2:
			s = "nd"
		case 3:
			s = "rd"
		}
	}
	return strconv.FormatInt(n, 10) + s
}

// MoneyWords spells an amount given in minor units ("one dollar and one
// cent"); exponent is the number of minor digits (0 to 3) and names are
// pluralized by appending "s" when the count is not 1.
func MoneyWords(minor int64, major, minorName string, exponent int) (string, error) {
	if minor < 0 || exponent < 0 || exponent > 3 {
		return "", ErrRange
	}
	unit := int64(1)
	for i := 0; i < exponent; i++ {
		unit *= 10
	}
	whole, frac := minor/unit, minor%unit
	w, err := NumberToWords(whole)
	if err != nil {
		return "", err
	}
	out := w + " " + major
	if whole != 1 {
		out += "s"
	}
	if exponent > 0 && frac != 0 {
		fw, _ := NumberToWords(frac)
		out += " and " + fw + " " + minorName
		if frac != 1 {
			out += "s"
		}
	}
	return out, nil
}
