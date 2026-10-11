// SPDX-License-Identifier: Apache-2.0

// Package textwrap wraps and truncates plain text, counting code points.
//
// WrapText keeps input line breaks (CRLF and CR become LF), splits each line
// on runs of spaces and tabs, fills lines greedily and breaks words longer
// than the width into width-sized chunks. TruncateText prefers to cut at a
// space in the second half of the kept text before adding the ellipsis.
package textwrap

import (
	"errors"
	"strings"
)

// ErrWidth is returned for a width or maximum length that cannot be honored.
var ErrWidth = errors.New("textwrap: invalid width")

// WrapText wraps text to lines of at most width code points.
func WrapText(text string, width int) (string, error) {
	if width < 1 {
		return "", ErrWidth
	}
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	var out []string
	for _, line := range strings.Split(text, "\n") {
		words := strings.FieldsFunc(line, func(r rune) bool { return r == ' ' || r == '\t' })
		var cur []rune
		for _, word := range words {
			w := []rune(word)
			for len(w) > width {
				if len(cur) > 0 {
					out = append(out, string(cur))
					cur = nil
				}
				out = append(out, string(w[:width]))
				w = w[width:]
			}
			switch {
			case len(w) == 0:
			case len(cur) == 0:
				cur = w
			case len(cur)+1+len(w) <= width:
				cur = append(append(cur, ' '), w...)
			default:
				out = append(out, string(cur))
				cur = w
			}
		}
		out = append(out, string(cur))
	}
	return strings.Join(out, "\n"), nil
}

// TruncateText shortens text to at most maxLen code points including ellipsis.
func TruncateText(text string, maxLen int, ellipsis string) (string, error) {
	r := []rune(text)
	if len(r) <= maxLen {
		return text, nil
	}
	keep := maxLen - len([]rune(ellipsis))
	if maxLen < 1 || keep < 0 {
		return "", ErrWidth
	}
	cut := r[:keep]
	sp := -1
	for i := len(cut) - 1; i >= 0; i-- {
		if cut[i] == ' ' {
			sp = i
			break
		}
	}
	if sp >= keep/2 && sp > 0 {
		cut = cut[:sp]
	}
	return strings.TrimRight(string(cut), " ") + ellipsis, nil
}
