// SPDX-License-Identifier: Apache-2.0

// Package dotenv parses .env files: blank and '#' comment lines are skipped, an
// "export " prefix is allowed, keys match [A-Za-z_][A-Za-z0-9_.]*, unquoted
// values are trimmed and end at " #", single-quoted values are literal,
// double-quoted values may span lines and support \n \r \t \" \\ \$. A later key
// overrides an earlier one but keeps the first position. Optional expansion
// replaces ${NAME} and ${NAME:-default} in unquoted and double-quoted values from
// earlier keys, then vars (empty counts as missing for :-).
package dotenv

import (
	"fmt"
	"strings"
	"unicode"
)

// Entry is one key/value pair; Parse returns entries in first-seen key order.
type Entry struct {
	Key, Value string
}

// Error is a syntax error with its 1-based line number.
type Error struct {
	Line int
	Msg  string
}

func (e *Error) Error() string { return fmt.Sprintf("dotenv: line %d: %s", e.Line, e.Msg) }

const marker = "\x00$" // an escaped \$ that must never be expanded

func keyChar(c byte, first bool) bool {
	return c == '_' || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (!first && ((c >= '0' && c <= '9') || c == '.'))
}

func validKey(k string) bool {
	if k == "" {
		return false
	}
	for i := 0; i < len(k); i++ {
		if !keyChar(k[i], i == 0) {
			return false
		}
	}
	return true
}

// Parse parses .env text; with expand, ${NAME} references resolve against earlier keys, then vars.
func Parse(text string, expand bool, vars map[string]string) ([]Entry, error) {
	lines := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	var keys []string
	vals := map[string]string{}
	kinds := map[string]string{}
	for i := 0; i < len(lines); {
		line := lines[i]
		no := i + 1
		i++
		s := strings.TrimSpace(line)
		if s == "" || strings.HasPrefix(s, "#") {
			continue
		}
		if strings.HasPrefix(s, "export ") {
			s = strings.TrimLeftFunc(s[7:], unicode.IsSpace)
		}
		eq := strings.IndexByte(s, '=')
		if eq < 0 {
			return nil, &Error{no, "expected KEY=VALUE"}
		}
		key, rest := strings.TrimSpace(s[:eq]), strings.TrimLeftFunc(s[eq+1:], unicode.IsSpace)
		if !validKey(key) {
			return nil, &Error{no, fmt.Sprintf("invalid key %q", key)}
		}
		var val, tail, kind string
		switch {
		case strings.HasPrefix(rest, "'"):
			end := strings.IndexByte(rest[1:], '\'')
			if end < 0 {
				return nil, &Error{no, "unterminated single quote"}
			}
			val, tail, kind = rest[1:1+end], rest[2+end:], "single"
		case strings.HasPrefix(rest, "\""):
			buf := rest[1:]
			var b strings.Builder
			j := 0
			for {
				closed := false
				for j < len(buf) {
					c := buf[j]
					if c == '\\' && j+1 < len(buf) {
						switch n := buf[j+1]; n {
						case 'n':
							b.WriteByte('\n')
						case 'r':
							b.WriteByte('\r')
						case 't':
							b.WriteByte('\t')
						case '"', '\\':
							b.WriteByte(n)
						case '$':
							b.WriteString(marker)
						default:
							b.WriteByte('\\')
							b.WriteByte(n)
						}
						j += 2
						continue
					}
					if c == '"' {
						closed = true
						break
					}
					b.WriteByte(c)
					j++
				}
				if closed {
					tail = buf[j+1:]
					break
				}
				if i >= len(lines) {
					return nil, &Error{no, "unterminated double quote"}
				}
				b.WriteByte('\n')
				buf, j = lines[i], 0
				i++
			}
			val, kind = b.String(), "double"
		default:
			cut := len(rest)
			prevSpace := false
			for k, r := range rest {
				if r == '#' && prevSpace {
					cut = k // the whitespace before '#' is trimmed below
					break
				}
				prevSpace = unicode.IsSpace(r)
			}
			val, kind = strings.TrimSpace(rest[:cut]), "plain"
		}
		if t := strings.TrimSpace(tail); t != "" && !strings.HasPrefix(t, "#") {
			return nil, &Error{no, "unexpected text after closing quote"}
		}
		if _, ok := vals[key]; !ok {
			keys = append(keys, key)
		}
		vals[key], kinds[key] = val, kind
	}
	if expand {
		done := map[string]string{}
		for _, k := range keys {
			v := vals[k]
			if kinds[k] != "single" {
				v = expandValue(v, done, vars)
			}
			done[k] = v
		}
		vals = done
	}
	out := make([]Entry, 0, len(keys))
	for _, k := range keys {
		out = append(out, Entry{k, strings.ReplaceAll(vals[k], marker, "$")})
	}
	return out, nil
}

func expandValue(v string, done, vars map[string]string) string {
	var b strings.Builder
	for i := 0; i < len(v); {
		if v[i] == '$' && i+1 < len(v) && v[i+1] == '{' && (i == 0 || v[i-1] != 0) {
			j := i + 2
			if j < len(v) && keyChar(v[j], true) {
				for j++; j < len(v) && keyChar(v[j], false); j++ {
				}
				name := v[i+2 : j]
				end, dflt, hasDflt := -1, "", false
				if j < len(v) && v[j] == '}' {
					end = j
				} else if strings.HasPrefix(v[j:], ":-") {
					if c := strings.IndexByte(v[j+2:], '}'); c >= 0 {
						end, dflt, hasDflt = j+2+c, v[j+2:j+2+c], true
					}
				}
				if end >= 0 {
					got, ok := done[name]
					if !ok {
						got, ok = vars[name]
					}
					if !ok || got == "" {
						got = ""
						if hasDflt {
							got = dflt
						}
					}
					b.WriteString(got)
					i = end + 1
					continue
				}
			}
		}
		b.WriteByte(v[i])
		i++
	}
	return b.String()
}
