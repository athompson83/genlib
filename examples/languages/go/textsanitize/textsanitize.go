// SPDX-License-Identifier: Apache-2.0

// Package textsanitize cleans untrusted display text: it normalizes line
// endings, removes control characters, bidirectional controls (the Trojan
// Source attack, CVE-2021-42574) and invisible zero-width characters, while
// keeping ZWNJ/ZWJ (U+200C/U+200D) that emoji sequences and Indic or Persian
// text need. It is not HTML escaping; escape for the output context too.
package textsanitize

import (
	"fmt"
	"strings"
)

func isBidi(r rune) bool {
	return r == 0x061C || r == 0x200E || r == 0x200F || r >= 0x202A && r <= 0x202E || r >= 0x2066 && r <= 0x2069
}

func isControl(r rune) bool { return r < 0x20 || r >= 0x7f && r <= 0x9f }

// Sanitize converts CRLF and lone CR to LF, keeps LF (or turns it into a
// space when allowNewlines is false) and TAB, and removes other C0/C1
// controls, DEL, bidirectional controls and U+200B, U+2060, U+FEFF. A
// maxLength >= 0 then truncates to that many code points; -1 means no limit.
func Sanitize(text string, allowNewlines bool, maxLength int) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	var b strings.Builder
	n := 0
	for _, r := range text {
		if maxLength >= 0 && n >= maxLength {
			break
		}
		switch {
		case r == '\n' && !allowNewlines:
			r = ' '
		case r == '\n' || r == '\t':
		case isControl(r) || isBidi(r) || r == 0x200B || r == 0x2060 || r == 0xFEFF:
			continue
		}
		b.WriteRune(r)
		n++
	}
	return b.String()
}

// BidiControl is a bidirectional control at a code point index, with its
// code point as uppercase hex ("202E").
type BidiControl struct {
	Index int
	Hex   string
}

// FindBidiControls lists the bidirectional controls in text, for rejecting
// or flagging source code and identifiers that could render misleadingly.
func FindBidiControls(text string) []BidiControl {
	var out []BidiControl
	i := 0
	for _, r := range text {
		if isBidi(r) {
			out = append(out, BidiControl{i, fmt.Sprintf("%04X", r)})
		}
		i++
	}
	return out
}

// NormalizeWhitespace collapses runs of space, tab, LF, CR, FF and VT into
// one space and trims spaces at both ends.
func NormalizeWhitespace(text string) string {
	return strings.Join(strings.FieldsFunc(text, func(r rune) bool {
		return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\f' || r == '\v'
	}), " ")
}
