// SPDX-License-Identifier: Apache-2.0

// Package checkdigits validates Luhn numbers, IBANs, GTIN/EAN/UPC codes and
// ISBN-10/13. Validators return false for bad input; converters return errors.
// A valid check digit proves only that the value is well formed, not that the
// card, account or product exists.
package checkdigits

import (
	"errors"
	"strings"
)

func stripSeparators(s string) string {
	return strings.NewReplacer(" ", "", "-", "").Replace(s)
}

func allDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// LuhnValid reports whether s (spaces and hyphens ignored) is at least two
// ASCII digits passing the Luhn mod-10 check.
func LuhnValid(s string) bool {
	t := stripSeparators(s)
	if len(t) < 2 || !allDigits(t) {
		return false
	}
	return luhnSum(t)%10 == 0
}

func luhnSum(t string) int {
	total := 0
	for i := 0; i < len(t); i++ {
		d := int(t[len(t)-1-i] - '0')
		if i%2 == 1 {
			d *= 2
			if d > 9 {
				d -= 9
			}
		}
		total += d
	}
	return total
}

// LuhnCheckDigit returns the digit that makes payload+digit Luhn-valid.
func LuhnCheckDigit(payload string) (string, error) {
	t := stripSeparators(payload)
	if t == "" || !allDigits(t) {
		return "", errors.New("checkdigits: payload must be ASCII digits")
	}
	for d := byte('0'); d <= '9'; d++ {
		if luhnSum(t+string(d))%10 == 0 {
			return string(d), nil
		}
	}
	return "", errors.New("checkdigits: unreachable")
}

func ibanShape(t string) bool {
	if len(t) < 15 || len(t) > 34 {
		return false
	}
	for i := 0; i < len(t); i++ {
		c := t[i]
		letter, digit := c >= 'A' && c <= 'Z', c >= '0' && c <= '9'
		switch {
		case i < 2 && !letter, i >= 2 && i < 4 && !digit, i >= 4 && !letter && !digit:
			return false
		}
	}
	return true
}

// IbanValid reports whether s (spaces ignored, any case) is a structurally
// valid IBAN with a correct ISO 7064 mod-97 check.
func IbanValid(s string) bool {
	t := strings.ToUpper(strings.ReplaceAll(s, " ", ""))
	if !ibanShape(t) {
		return false
	}
	r := t[4:] + t[:4]
	rem := 0
	for i := 0; i < len(r); i++ {
		c := r[i]
		if c >= '0' && c <= '9' {
			rem = (rem*10 + int(c-'0')) % 97
		} else {
			rem = (rem*100 + int(c-'A') + 10) % 97
		}
	}
	return rem == 1
}

// IbanFormat returns a valid IBAN in uppercase groups of four.
func IbanFormat(s string) (string, error) {
	t := strings.ToUpper(strings.ReplaceAll(s, " ", ""))
	if !IbanValid(t) {
		return "", errors.New("checkdigits: invalid IBAN")
	}
	var groups []string
	for i := 0; i < len(t); i += 4 {
		end := i + 4
		if end > len(t) {
			end = len(t)
		}
		groups = append(groups, t[i:end])
	}
	return strings.Join(groups, " "), nil
}

func gtinSum(t string) int {
	total := 0
	for i := 0; i < len(t); i++ {
		d := int(t[len(t)-1-i] - '0')
		if i%2 == 1 {
			d *= 3
		}
		total += d
	}
	return total
}

// GtinValid reports whether s is a GTIN-8/12/13/14 (EAN/UPC) with a correct
// check digit; spaces and hyphens are ignored.
func GtinValid(s string) bool {
	t := stripSeparators(s)
	switch len(t) {
	case 8, 12, 13, 14:
	default:
		return false
	}
	return allDigits(t) && gtinSum(t)%10 == 0
}

func isbn10Clean(s string) (string, bool) {
	t := strings.ToUpper(stripSeparators(s))
	if len(t) != 10 || !allDigits(t[:9]) {
		return "", false
	}
	if last := t[9]; last != 'X' && (last < '0' || last > '9') {
		return "", false
	}
	total := 0
	for i := 0; i < 10; i++ {
		v := 10
		if t[i] != 'X' {
			v = int(t[i] - '0')
		}
		total += (10 - i) * v
	}
	return t, total%11 == 0
}

// Isbn10Valid reports whether s is an ISBN-10 (final X allowed) with a correct
// mod-11 check digit.
func Isbn10Valid(s string) bool {
	_, ok := isbn10Clean(s)
	return ok
}

// Isbn13Valid reports whether s is a 978/979-prefixed ISBN-13 with a correct
// check digit.
func Isbn13Valid(s string) bool {
	t := stripSeparators(s)
	return len(t) == 13 && (strings.HasPrefix(t, "978") || strings.HasPrefix(t, "979")) && GtinValid(t)
}

// Isbn10To13 converts a valid ISBN-10 to its 978-prefixed ISBN-13.
func Isbn10To13(s string) (string, error) {
	t, ok := isbn10Clean(s)
	if !ok {
		return "", errors.New("checkdigits: invalid ISBN-10")
	}
	body := "978" + t[:9]
	check := (10 - gtinSum(body+"0")%10) % 10
	return body + string(rune('0'+check)), nil
}
