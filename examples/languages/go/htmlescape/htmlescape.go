// SPDX-License-Identifier: Apache-2.0

// Package htmlescape escapes text for HTML text and quoted attributes,
// decodes character references and strips tags for plain-text previews.
//
// Unescape decodes &#NNN; (1-10 decimal digits) and &#xHHH; (1-8 hex digits)
// with a required ';' (0, surrogates and values above U+10FFFF become U+FFFD
// and 0x80-0x9F map through the HTML5 windows-1252 table) plus a fixed set of
// common named references (case-sensitive, ';' required). Anything else is
// left as is.
package htmlescape

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

var escaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

// Escape replaces & < > " ' with &amp; &lt; &gt; &quot; &#39;.
func Escape(s string) string { return escaper.Replace(s) }

var named = map[string]string{
	"amp": "&", "lt": "<", "gt": ">", "quot": `"`, "apos": "'", "nbsp": " ", "copy": "©",
	"reg": "®", "trade": "™", "hellip": "…", "mdash": "—", "ndash": "–",
	"lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "bull": "•",
	"middot": "·", "deg": "°", "plusmn": "±", "times": "×", "divide": "÷",
	"euro": "€", "pound": "£", "yen": "¥", "cent": "¢", "sect": "§",
	"para": "¶", "laquo": "«", "raquo": "»", "iexcl": "¡", "iquest": "¿",
	"shy": "­",
}

var c1 = map[uint64]rune{
	0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
	0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018,
	0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC,
	0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
}

var refRe = regexp.MustCompile(`&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});`)

func numeric(v uint64) string {
	if v == 0 || (v >= 0xD800 && v <= 0xDFFF) || v > 0x10FFFF {
		return "�"
	}
	if r, ok := c1[v]; ok {
		return string(r)
	}
	return string(rune(v))
}

// Unescape decodes numeric and the supported named character references.
func Unescape(s string) string {
	return refRe.ReplaceAllStringFunc(s, func(m string) string {
		g := m[1 : len(m)-1]
		if g[0] == '#' {
			var v uint64
			var err error
			if g[1] == 'x' || g[1] == 'X' {
				v, err = strconv.ParseUint(g[2:], 16, 64)
			} else {
				v, err = strconv.ParseUint(g[1:], 10, 64)
			}
			if err != nil {
				return m
			}
			return numeric(v)
		}
		if r, ok := named[g]; ok {
			return r
		}
		return m
	})
}

func isSpace(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) }

func isWord(r rune) bool { return r == '_' || unicode.IsLetter(r) || unicode.IsNumber(r) }

// hasPrefixFold reports whether s[i:] starts with the ASCII word w, ignoring ASCII case.
func hasPrefixFold(s string, i int, w string) bool {
	return len(s)-i >= len(w) && strings.EqualFold(s[i:i+len(w)], w)
}

// closeTagEnd returns the end of "</name\s*>" at i (ASCII case-insensitive), or -1.
func closeTagEnd(s string, i int, name string) int {
	if !strings.HasPrefix(s[i:], "</") || !hasPrefixFold(s, i+2, name) {
		return -1
	}
	j := i + 2 + len(name)
	for j < len(s) {
		r, size := utf8.DecodeRuneInString(s[j:])
		if !isSpace(r) {
			break
		}
		j += size
	}
	if j < len(s) && s[j] == '>' {
		return j + 1
	}
	return -1
}

// dropScriptStyle removes <script>/<style> elements and their content up to the matching close tag or the end.
func dropScriptStyle(s string) string {
	var out strings.Builder
	for i := 0; i < len(s); {
		if s[i] == '<' {
			if end := scriptElementEnd(s, i); end >= 0 {
				i = end
				continue
			}
		}
		out.WriteByte(s[i])
		i++
	}
	return out.String()
}

func scriptElementEnd(s string, i int) int {
	for _, name := range []string{"script", "style"} {
		if !hasPrefixFold(s, i+1, name) {
			continue
		}
		j := i + 1 + len(name)
		if j < len(s) {
			if r, _ := utf8.DecodeRuneInString(s[j:]); isWord(r) {
				continue
			}
		}
		gt := strings.IndexByte(s[j:], '>')
		if gt < 0 {
			continue
		}
		for q := j + gt + 1; q <= len(s); q++ {
			if q < len(s) {
				if e := closeTagEnd(s, q, name); e >= 0 {
					return e
				}
			}
			if q == len(s) || (q == len(s)-1 && s[q] == '\n') {
				return q
			}
		}
	}
	return -1
}

// StripTags drops script/style contents, removes tags and unescapes, for plain-text previews; it is NOT an HTML sanitizer.
func StripTags(s string) string {
	s = dropScriptStyle(s)
	var out strings.Builder
	for i := 0; i < len(s); {
		if s[i] == '<' && i+1 < len(s) {
			c := s[i+1]
			if (c|32 >= 'a' && c|32 <= 'z') || c == '/' || c == '!' || c == '?' {
				if gt := strings.IndexByte(s[i+1:], '>'); gt >= 0 {
					i = i + 1 + gt + 1
					continue
				}
			}
		}
		out.WriteByte(s[i])
		i++
	}
	return Unescape(out.String())
}
