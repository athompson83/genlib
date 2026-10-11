// SPDX-License-Identifier: Apache-2.0

// Package disposition builds and parses Content-Disposition headers (RFC 6266
// with RFC 8187 filename*). Filenames are sanitized both ways: '/', '\', '"'
// and control characters become '_', spaces and dots are trimmed from both ends
// and an empty result becomes "download".
package disposition

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ErrSyntax is wrapped by every parse error.
var ErrSyntax = errors.New("disposition: syntax error")

func derr(msg string) error { return &dispError{msg} }

type dispError struct{ msg string }

func (e *dispError) Error() string { return "disposition: " + e.msg }
func (e *dispError) Unwrap() error { return ErrSyntax }

// Param is one header parameter; names are lowercased.
type Param struct {
	Name, Value string
}

// Disposition is a parsed header; Filename is nil when no filename parameter is present.
type Disposition struct {
	Type     string
	Filename *string
	Params   []Param
}

const attr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~"

// Sanitize makes a filename safe to save: separators, quotes and controls become '_', edge spaces and dots are trimmed.
func Sanitize(name string) string {
	var b strings.Builder
	for _, c := range name {
		if c == '/' || c == '\\' || c == '"' || c < 0x20 || c == 0x7f {
			b.WriteByte('_')
		} else {
			b.WriteRune(c)
		}
	}
	out := strings.Trim(b.String(), " .")
	if out == "" {
		return "download"
	}
	return out
}

// Build returns an attachment (or inline) header with filename and, for non-ASCII names, an ASCII fallback plus filename*.
func Build(filename string, inline bool) string {
	name := Sanitize(filename)
	kind := "attachment"
	if inline {
		kind = "inline"
	}
	ascii := true
	for _, c := range name {
		if c < 0x20 || c >= 0x7f {
			ascii = false
			break
		}
	}
	if ascii {
		return kind + "; filename=\"" + name + "\""
	}
	const hexd = "0123456789ABCDEF"
	var fb, enc strings.Builder
	for _, c := range name {
		if c >= 0x20 && c < 0x7f {
			fb.WriteRune(c)
		} else {
			fb.WriteByte('_')
		}
		if c < 0x80 && strings.ContainsRune(attr, c) {
			enc.WriteRune(c)
			continue
		}
		var buf [4]byte
		for _, x := range buf[:utf8.EncodeRune(buf[:], c)] {
			enc.WriteByte('%')
			enc.WriteByte(hexd[x>>4])
			enc.WriteByte(hexd[x&15])
		}
	}
	return kind + "; filename=\"" + fb.String() + "\"; filename*=UTF-8''" + enc.String()
}

func isTokenChar(c rune) bool {
	return c < 0x80 && (c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || strings.ContainsRune("!#$%&'*+-.^_`|~", c))
}

func isHex(c rune) bool { return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' }

func hexVal(c byte) byte {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	}
	return c - 'A' + 10
}

func decodeExt(v string) (string, error) {
	r := []rune(v)
	i := 0
	for i < len(r) && (isTokenChar(r[i]) && r[i] != '%' && r[i] != '\'' && r[i] != '*' && r[i] != '.' && r[i] != '|' || r[i] == '{' || r[i] == '}') {
		i++
	}
	if i == 0 || i >= len(r) || r[i] != '\'' {
		return "", derr("bad extended value")
	}
	cs := strings.ToLower(string(r[:i]))
	j := i + 1
	for j < len(r) && (r[j] >= 'a' && r[j] <= 'z' || r[j] >= 'A' && r[j] <= 'Z' || r[j] >= '0' && r[j] <= '9' || r[j] == '-') {
		j++
	}
	if j >= len(r) || r[j] != '\'' {
		return "", derr("bad extended value")
	}
	rest := r[j+1:]
	for _, c := range rest {
		if c == '\n' {
			return "", derr("bad extended value")
		}
	}
	if cs != "utf-8" && cs != "iso-8859-1" {
		return "", derr("bad extended value")
	}
	for k, c := range rest {
		if c == '%' && !(k+2 < len(rest) && isHex(rest[k+1]) && isHex(rest[k+2])) {
			return "", derr("bad percent-encoding")
		}
	}
	src := []byte(string(rest))
	var b []byte
	for k := 0; k < len(src); k++ {
		if src[k] == '%' {
			b = append(b, hexVal(src[k+1])<<4|hexVal(src[k+2]))
			k += 2
		} else {
			b = append(b, src[k])
		}
	}
	if cs == "utf-8" {
		if !utf8.Valid(b) {
			return "", derr("invalid UTF-8")
		}
		return string(b), nil
	}
	out := make([]rune, len(b))
	for k, c := range b {
		out[k] = rune(c)
	}
	return string(out), nil
}

// Parse reads a Content-Disposition value; filename* wins over filename and the returned Filename is sanitized.
func Parse(value string) (Disposition, error) {
	s := []rune(value)
	n, i := len(s), 0
	for i < n && unicode.IsSpace(s[i]) {
		i++
	}
	start := i
	for i < n && isTokenChar(s[i]) {
		i++
	}
	if i == start {
		return Disposition{}, derr("missing disposition type")
	}
	kind := strings.ToLower(string(s[start:i]))
	for i < n && unicode.IsSpace(s[i]) {
		i++
	}
	ws := func() {
		for i < n && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
	}
	params := []Param{}
	for i < n {
		if s[i] != ';' {
			return Disposition{}, derr("expected ;")
		}
		i++
		ws()
		if i >= n {
			break
		}
		start := i
		for i < n && isTokenChar(s[i]) {
			i++
		}
		if i == start {
			return Disposition{}, derr("expected parameter")
		}
		name := strings.ToLower(string(s[start:i]))
		ws()
		if i >= n || s[i] != '=' {
			return Disposition{}, derr("expected =")
		}
		i++
		ws()
		var val string
		if i < n && s[i] == '"' {
			i++
			var buf []rune
			for {
				if i >= n {
					return Disposition{}, derr("unterminated quote")
				}
				c := s[i]
				if c == '\\' && i+1 < n {
					buf = append(buf, s[i+1])
					i += 2
					continue
				}
				if c == '"' {
					i++
					break
				}
				buf = append(buf, c)
				i++
			}
			val = string(buf)
		} else {
			start := i
			for i < n && s[i] != ';' && !unicode.IsSpace(s[i]) {
				i++
			}
			val = string(s[start:i])
		}
		ws()
		if strings.HasSuffix(name, "*") {
			dec, err := decodeExt(val)
			if err != nil {
				return Disposition{}, err
			}
			params = setParam(params, name[:len(name)-1], dec)
		} else if !hasParam(params, name) {
			params = append(params, Param{name, val})
		}
	}
	d := Disposition{Type: kind, Params: params}
	for _, p := range params {
		if p.Name == "filename" {
			fn := Sanitize(p.Value)
			d.Filename = &fn
		}
	}
	return d, nil
}

func hasParam(ps []Param, name string) bool {
	for _, p := range ps {
		if p.Name == name {
			return true
		}
	}
	return false
}

func setParam(ps []Param, name, value string) []Param {
	for k := range ps {
		if ps[k].Name == name {
			ps[k].Value = value
			return ps
		}
	}
	return append(ps, Param{name, value})
}
