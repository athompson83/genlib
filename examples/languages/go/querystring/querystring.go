// SPDX-License-Identifier: Apache-2.0

// Package querystring parses and serializes application/x-www-form-urlencoded
// text per the WHATWG URL standard: '+' is a space, percent-escapes decode to
// bytes (an invalid '%' stays literal) and the bytes decode as UTF-8 with U+FFFD
// for each maximal invalid subsequence.
package querystring

import (
	"strings"
	"unicode/utf8"
)

// Pair is one name/value pair.
type Pair [2]string

func hexVal(c byte) (byte, bool) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', true
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, true
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, true
	}
	return 0, false
}

// invalidLen returns the length of the maximal invalid UTF-8 subsequence at b[0].
func invalidLen(b []byte) int {
	lo, hi, need := byte(0x80), byte(0xBF), 0
	switch c := b[0]; {
	case c >= 0xC2 && c <= 0xDF:
		need = 1
	case c == 0xE0:
		lo, need = 0xA0, 2
	case c == 0xED:
		hi, need = 0x9F, 2
	case c >= 0xE1 && c <= 0xEF:
		need = 2
	case c == 0xF0:
		lo, need = 0x90, 3
	case c == 0xF4:
		hi, need = 0x8F, 3
	case c >= 0xF1 && c <= 0xF3:
		need = 3
	default:
		return 1
	}
	n := 1
	for k := 0; k < need && n < len(b); k++ {
		c := b[n]
		if k == 0 && (c < lo || c > hi) || k > 0 && (c < 0x80 || c > 0xBF) {
			break
		}
		n++
	}
	return n
}

func decodeUTF8(b []byte) string {
	var sb strings.Builder
	for len(b) > 0 {
		r, size := utf8.DecodeRune(b)
		if r == utf8.RuneError && size <= 1 {
			sb.WriteRune(utf8.RuneError)
			b = b[invalidLen(b):]
			continue
		}
		sb.WriteRune(r)
		b = b[size:]
	}
	return sb.String()
}

func decode(s string) string {
	b := []byte(strings.ReplaceAll(s, "+", " "))
	out := make([]byte, 0, len(b))
	for i := 0; i < len(b); {
		if b[i] == '%' && i+2 < len(b) {
			h, ok1 := hexVal(b[i+1])
			l, ok2 := hexVal(b[i+2])
			if ok1 && ok2 {
				out = append(out, h<<4|l)
				i += 3
				continue
			}
		}
		out = append(out, b[i])
		i++
	}
	return decodeUTF8(out)
}

// Parse splits a query string (one leading '?' removed) into ordered pairs; empty pieces are skipped.
func Parse(s string) []Pair {
	s = strings.TrimPrefix(s, "?")
	pairs := []Pair{}
	for _, piece := range strings.Split(s, "&") {
		if piece == "" {
			continue
		}
		n, v := piece, ""
		if i := strings.IndexByte(piece, '='); i >= 0 {
			n, v = piece[:i], piece[i+1:]
		}
		pairs = append(pairs, Pair{decode(n), decode(v)})
	}
	return pairs
}

func encode(s string) string {
	const hexd = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9', c == '*', c == '-', c == '.', c == '_':
			b.WriteByte(c)
		case c == ' ':
			b.WriteByte('+')
		default:
			b.WriteByte('%')
			b.WriteByte(hexd[c>>4])
			b.WriteByte(hexd[c&15])
		}
	}
	return b.String()
}

// Stringify serializes pairs as name=value joined by '&', keeping only A-Z a-z 0-9 * - . _ unescaped.
func Stringify(pairs []Pair) string {
	parts := make([]string, len(pairs))
	for i, p := range pairs {
		parts[i] = encode(p[0]) + "=" + encode(p[1])
	}
	return strings.Join(parts, "&")
}

// GetAll returns every value whose name equals name, in order.
func GetAll(pairs []Pair, name string) []string {
	out := []string{}
	for _, p := range pairs {
		if p[0] == name {
			out = append(out, p[1])
		}
	}
	return out
}
