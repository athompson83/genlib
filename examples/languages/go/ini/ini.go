// SPDX-License-Identifier: Apache-2.0

// Package ini parses and writes the common INI subset used by git config, PHP
// and Python configparser defaults. Sections and keys keep their order and
// case; keys before any header go in section "" (always present and first).
//
// Lines are trimmed; blank lines and lines starting with ';' or '#' are
// skipped. "[name]" starts a section (a repeated name continues it). A key and
// value are split at the first '=' or ':'; a bare key has the value "". A
// value wrapped in double quotes is unquoted with \\ \" \n \t escapes;
// otherwise an inline comment starts at whitespace followed by ';' or '#'. The
// last duplicate key wins and keeps its first position. Errors name the
// 1-based line.
package ini

import (
	"errors"
	"fmt"
	"strings"
	"unicode"
)

// ErrIni is wrapped by every parse error.
var ErrIni = errors.New("ini: invalid input")

type iniError struct{ msg string }

func (e *iniError) Error() string { return "ini: " + e.msg }
func (e *iniError) Unwrap() error { return ErrIni }

// Entry is one key and its value.
type Entry struct{ Key, Value string }

// Section is a named, ordered list of entries.
type Section struct {
	Name    string
	Entries []Entry
}

// Get returns the value for key and whether it is present.
func (s *Section) Get(key string) (string, bool) {
	for _, e := range s.Entries {
		if e.Key == key {
			return e.Value, true
		}
	}
	return "", false
}

func (s *Section) put(key, value string) {
	for i := range s.Entries {
		if s.Entries[i].Key == key {
			s.Entries[i].Value = value
			return
		}
	}
	s.Entries = append(s.Entries, Entry{key, value})
}

func isSpace(r rune) bool { return unicode.IsSpace(r) || (r >= 0x1c && r <= 0x1f) }

func trim(s string) string { return strings.TrimFunc(s, isSpace) }

// Parse reads INI text into ordered sections, section "" first.
func Parse(text string) ([]Section, error) {
	out := []Section{{Name: ""}}
	cur := 0
	for no, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		no++
		s := trim(line)
		if s == "" || s[0] == ';' || s[0] == '#' {
			continue
		}
		if s[0] == '[' {
			if !strings.HasSuffix(s, "]") || len(s) < 2 {
				return nil, &iniError{fmt.Sprintf("line %d: unterminated section header", no)}
			}
			name := trim(s[1 : len(s)-1])
			if name == "" || strings.Contains(name, "]") {
				return nil, &iniError{fmt.Sprintf("line %d: bad section name", no)}
			}
			cur = -1
			for i := range out {
				if out[i].Name == name {
					cur = i
					break
				}
			}
			if cur < 0 {
				out = append(out, Section{Name: name})
				cur = len(out) - 1
			}
			continue
		}
		var key, val string
		i := strings.IndexAny(s, "=:")
		if i >= 0 {
			key, val = trim(s[:i]), trim(s[i+1:])
		} else {
			key = s
		}
		if key == "" {
			return nil, &iniError{fmt.Sprintf("line %d: empty key", no)}
		}
		if strings.HasPrefix(val, `"`) {
			var buf strings.Builder
			closed := false
			for j := 1; j < len(val); {
				c := val[j]
				if c == '\\' && j+1 < len(val) {
					switch val[j+1] {
					case 'n':
						buf.WriteByte('\n')
					case 't':
						buf.WriteByte('\t')
					default:
						buf.WriteByte(val[j+1])
					}
					j += 2
					continue
				}
				if c == '"' {
					closed = true
					break
				}
				buf.WriteByte(c)
				j++
			}
			if !closed {
				return nil, &iniError{fmt.Sprintf("line %d: unterminated quote", no)}
			}
			val = buf.String()
		} else {
			cut := -1
			for _, m := range []string{" ;", " #", "\t;", "\t#"} {
				if k := strings.Index(val, m); k >= 0 && (cut < 0 || k < cut) {
					cut = k
				}
			}
			if cut >= 0 {
				val = strings.TrimRightFunc(val[:cut], isSpace)
			}
		}
		out[cur].put(key, val)
	}
	return out, nil
}

func quote(v string) string {
	if v == "" || v != trim(v) || strings.ContainsAny(v, ";#\"\\\n\t") {
		r := strings.NewReplacer(`\`, `\\`, `"`, `\"`, "\n", `\n`, "\t", `\t`)
		return `"` + r.Replace(v) + `"`
	}
	return v
}

func lines(entries []Entry) []string {
	var out []string
	for _, e := range entries {
		out = append(out, e.Key+" = "+quote(e.Value))
	}
	return out
}

// Stringify writes section "" first (no header), then "[name]" blocks separated by one blank line.
func Stringify(data []Section) string {
	var blocks []string
	for _, s := range data {
		if s.Name == "" && len(s.Entries) > 0 {
			blocks = append(blocks, strings.Join(lines(s.Entries), "\n"))
			break
		}
	}
	for _, s := range data {
		if s.Name == "" {
			continue
		}
		blocks = append(blocks, strings.Join(append([]string{"[" + s.Name + "]"}, lines(s.Entries)...), "\n"))
	}
	if len(blocks) == 0 {
		return ""
	}
	return strings.Join(blocks, "\n\n") + "\n"
}
