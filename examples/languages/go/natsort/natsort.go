// SPDX-License-Identifier: Apache-2.0

// Package natsort orders strings naturally ("file2" before "file10"): runs of
// ASCII digits compare by numeric value at any length, other runs compare
// after ASCII-only case folding by code point, with deterministic tie-breaks.
package natsort

import "sort"

type run struct {
	digit bool
	text  string
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

func runs(s string) []run {
	var out []run
	for i := 0; i < len(s); {
		j, d := i, isDigit(s[i])
		for j < len(s) && isDigit(s[j]) == d {
			j++
		}
		out = append(out, run{d, s[i:j]})
		i = j
	}
	return out
}

func fold(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

func cmpInt(x, y int) int {
	switch {
	case x < y:
		return -1
	case x > y:
		return 1
	}
	return 0
}

func cmpStr(x, y string) int {
	switch {
	case x < y:
		return -1
	case x > y:
		return 1
	}
	return 0
}

func stripZeros(s string) string {
	i := 0
	for i < len(s)-1 && s[i] == '0' {
		i++
	}
	return s[i:]
}

// Compare returns -1, 0 or 1: run by run (digits by value, a digit run before a text run, text by ASCII-folded code points); ties: fewer runs, fewer leading zeros, then plain code point order.
func Compare(a, b string) int {
	ra, rb := runs(a), runs(b)
	n := len(ra)
	if len(rb) < n {
		n = len(rb)
	}
	for i := 0; i < n; i++ {
		x, y := ra[i], rb[i]
		var c int
		switch {
		case x.digit && y.digit:
			na, nb := stripZeros(x.text), stripZeros(y.text)
			if c = cmpInt(len(na), len(nb)); c == 0 {
				c = cmpStr(na, nb)
			}
		case x.digit != y.digit:
			c = 1
			if x.digit {
				c = -1
			}
		default:
			c = cmpStr(fold(x.text), fold(y.text))
		}
		if c != 0 {
			return c
		}
	}
	if c := cmpInt(len(ra), len(rb)); c != 0 {
		return c
	}
	for i := 0; i < n; i++ {
		if ra[i].digit && rb[i].digit {
			if c := cmpInt(len(ra[i].text), len(rb[i].text)); c != 0 {
				return c
			}
		}
	}
	return cmpStr(a, b)
}

// Sort returns a new slice sorted with Compare (stable).
func Sort(items []string) []string {
	out := append([]string(nil), items...)
	sort.SliceStable(out, func(i, j int) bool { return Compare(out[i], out[j]) < 0 })
	return out
}
