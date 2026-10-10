// SPDX-License-Identifier: Apache-2.0

// Package slugify turns titles into URL slugs ("Crème brûlée & Café" ->
// "creme-brulee-cafe") without a Unicode database: a fixed table
// transliterates U+00C0..U+017F (Latin-1 Supplement and Latin Extended-A),
// so every Genlib language gives identical results. Other non-ASCII
// characters end a word and are dropped.
package slugify

import (
	"errors"
	"strconv"
	"strings"
)

// table lists the transliteration of each code point U+00C0..U+017F in order,
// separated by "|"; an empty entry (U+00D7, U+00F7) has no transliteration.
const table = "A|A|A|A|A|A|AE|C|E|E|E|E|I|I|I|I|D|N|O|O|O|O|O||O|U|U|U|U|Y|TH|ss|" +
	"a|a|a|a|a|a|ae|c|e|e|e|e|i|i|i|i|d|n|o|o|o|o|o||o|u|u|u|u|y|th|y|" +
	"A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|D|d|E|e|E|e|E|e|E|e|E|e|G|g|G|g|G|g|G|g|H|h|H|h|" +
	"I|i|I|i|I|i|I|i|I|i|IJ|ij|J|j|K|k|q|L|l|L|l|L|l|L|l|L|l|N|n|N|n|N|n|n|N|n|" +
	"O|o|O|o|O|o|OE|oe|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|T|t|" +
	"U|u|U|u|U|u|U|u|U|u|U|u|W|w|Y|y|Y|Z|z|Z|z|Z|z|s"

var translit = strings.Split(table, "|")

// transliterate returns the table entry for r, or r itself.
func transliterate(r rune) string {
	if r >= 0xC0 && r <= 0x17F {
		if t := translit[r-0xC0]; t != "" {
			return t
		}
	}
	return string(r)
}

// Slugify lowercases ASCII letters, transliterates U+00C0..U+017F, keeps
// a-z and 0-9, drops apostrophes (U+0027, U+2019) and combining marks
// (U+0300..U+036F) inside words, and joins the words with separator, which
// must be "-", "_" or ".". When maxLength > 0 the slug is cut to at most
// maxLength characters, back to a word boundary when the cut splits a word
// (a single over-long word is cut inside), with no trailing separator.
func Slugify(text, separator string, maxLength int) (string, error) {
	if separator != "-" && separator != "_" && separator != "." {
		return "", errors.New(`slugify: separator must be "-", "_" or "."`)
	}
	if maxLength < 0 {
		return "", errors.New("slugify: maxLength must be >= 0")
	}
	var words []string
	var cur []byte
	for _, r := range text {
		for _, ch := range transliterate(r) {
			if ch >= 'A' && ch <= 'Z' {
				ch += 'a' - 'A'
			}
			switch {
			case ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9':
				cur = append(cur, byte(ch))
			case ch == '\'' || ch == '’' || ch >= 0x300 && ch <= 0x36F:
				// apostrophes and combining marks join words
			case len(cur) > 0:
				words = append(words, string(cur))
				cur = cur[:0]
			}
		}
	}
	if len(cur) > 0 {
		words = append(words, string(cur))
	}
	slug := strings.Join(words, separator)
	if maxLength > 0 && len(slug) > maxLength {
		cut := slug[:maxLength]
		if slug[maxLength] != separator[0] {
			if k := strings.LastIndex(cut, separator); k >= 0 {
				cut = cut[:k]
			}
		}
		slug = strings.TrimRight(cut, separator)
	}
	return slug, nil
}

// UniqueSlug returns base when it is not taken, otherwise the first free
// base+separator+"2", base+separator+"3", ...
func UniqueSlug(base string, taken map[string]bool, separator string) (string, error) {
	if base == "" {
		return "", errors.New("slugify: empty base")
	}
	if !taken[base] {
		return base, nil
	}
	n := 2
	for taken[base+separator+strconv.Itoa(n)] {
		n++
	}
	return base + separator + strconv.Itoa(n), nil
}
