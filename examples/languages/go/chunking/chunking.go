// SPDX-License-Identifier: Apache-2.0

// Package chunking splits text for retrieval (RAG): it splits at the largest
// natural boundary that fits (paragraphs, lines, sentences, spaces, then single
// code points), packs pieces greedily and can overlap whole pieces. Lengths
// count Unicode code points; whitespace means ASCII space, tab, LF, CR, FF, VT.
package chunking

import (
	"errors"
	"strings"
)

const ws = " \t\n\r\f\v"

func isWS(r rune) bool { return r < 128 && strings.ContainsRune(ws, r) }

func hasPrefixAt(t []rune, i int, sep []rune) bool {
	if i+len(sep) > len(t) {
		return false
	}
	for k, r := range sep {
		if t[i+k] != r {
			return false
		}
	}
	return true
}

// splitKeep returns pieces at one boundary level; each keeps its trailing separator.
func splitKeep(t []rune, level int) [][]rune {
	var out [][]rune
	switch level {
	case 0, 1, 3:
		sep := map[int][]rune{0: []rune("\n\n"), 1: []rune("\n"), 3: []rune(" ")}[level]
		start := 0
		for i := start; i < len(t); {
			if !hasPrefixAt(t, i, sep) {
				i++
				continue
			}
			j := i + len(sep)
			for hasPrefixAt(t, j, sep) {
				j += len(sep)
			}
			out = append(out, t[start:j])
			start, i = j, j
		}
		if start < len(t) {
			out = append(out, t[start:])
		}
	case 2:
		start := 0
		for i := 0; i < len(t); {
			if (t[i] == '.' || t[i] == '!' || t[i] == '?') && i+1 < len(t) && isWS(t[i+1]) {
				j := i + 1
				for j < len(t) && isWS(t[j]) {
					j++
				}
				out = append(out, t[start:j])
				start, i = j, j
				continue
			}
			i++
		}
		if start < len(t) {
			out = append(out, t[start:])
		}
	default:
		for i := range t {
			out = append(out, t[i:i+1])
		}
	}
	return out
}

func pieces(t []rune, maxChars, level int) [][]rune {
	if len(t) <= maxChars {
		return [][]rune{t}
	}
	var out [][]rune
	for _, p := range splitKeep(t, level) {
		if len(p) <= maxChars {
			out = append(out, p)
		} else {
			out = append(out, pieces(p, maxChars, level+1)...)
		}
	}
	return out
}

// ChunkText returns chunks of at most maxChars code points, trimmed of surrounding whitespace and never empty; overlap > 0 starts each chunk with the last whole pieces of the previous one totalling at most overlap.
func ChunkText(text string, maxChars, overlap int) ([]string, error) {
	if maxChars < 1 {
		return nil, errors.New("chunking: maxChars must be >= 1")
	}
	if overlap < 0 || overlap >= maxChars {
		return nil, errors.New("chunking: overlap must be in 0..maxChars-1")
	}
	chunks := []string{}
	var cur [][]rune
	size := 0
	emit := func() {
		var b strings.Builder
		for _, p := range cur {
			b.WriteString(string(p))
		}
		if s := strings.Trim(b.String(), ws); s != "" {
			chunks = append(chunks, s)
		}
	}
	for _, p := range pieces([]rune(text), maxChars, 0) {
		if len(cur) > 0 && size+len(p) > maxChars {
			emit()
			var keep [][]rune
			total := 0
			if overlap > 0 {
				for i := len(cur) - 1; i >= 1; i-- { // never repeat the whole previous chunk
					if total+len(cur[i]) > overlap {
						break
					}
					keep = append([][]rune{cur[i]}, keep...)
					total += len(cur[i])
				}
			}
			for len(keep) > 0 && total+len(p) > maxChars {
				total -= len(keep[0])
				keep = keep[1:]
			}
			cur, size = keep, total
		}
		cur = append(cur, p)
		size += len(p)
	}
	if len(cur) > 0 {
		emit()
	}
	return chunks, nil
}
