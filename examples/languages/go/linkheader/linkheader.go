// SPDX-License-Identifier: Apache-2.0

// Package linkheader parses and formats HTTP Link headers (RFC 8288). Commas
// inside <...> and quoted strings do not split; parameter names are lowercased;
// RFC 8187 "name*" values (UTF-8 or ISO-8859-1) win over the plain form and are
// stored without '*'; otherwise the first occurrence wins; rel is lowercased
// with whitespace collapsed.
package linkheader

import (
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ErrSyntax is wrapped by every parse error.
var ErrSyntax = errors.New("linkheader: syntax error")

func lerr(msg string) error { return &linkError{msg} }

type linkError struct{ msg string }

func (e *linkError) Error() string { return "linkheader: " + e.msg }
func (e *linkError) Unwrap() error { return ErrSyntax }

// Param is one link parameter.
type Param struct {
	Name, Value string
}

// Link is one link-value: a target URI and its ordered parameters.
type Link struct {
	URI    string
	Params []Param
}

// Get returns the value of parameter name and whether it is present.
func (l Link) Get(name string) (string, bool) {
	for _, p := range l.Params {
		if p.Name == name {
			return p.Value, true
		}
	}
	return "", false
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

// decodeExt decodes an RFC 8187 ext-value: charset'lang'pct-encoded.
func decodeExt(v string) (string, error) {
	r := []rune(v)
	i := 0
	for i < len(r) && r[i] < 0x80 && (isTokenChar(r[i]) && r[i] != '%' && r[i] != '\'' && r[i] != '*' && r[i] != '.' && r[i] != '|' || r[i] == '{' || r[i] == '}') {
		i++
	}
	if i == 0 || i >= len(r) || r[i] != '\'' {
		return "", lerr("bad extended value")
	}
	cs := strings.ToLower(string(r[:i]))
	j := i + 1
	for j < len(r) && (r[j] < 0x80 && (unicode.IsLetter(r[j]) || unicode.IsDigit(r[j])) || r[j] == '-') {
		j++
	}
	if j >= len(r) || r[j] != '\'' {
		return "", lerr("bad extended value")
	}
	rest := r[j+1:]
	for _, c := range rest {
		if c == '\n' {
			return "", lerr("bad extended value")
		}
	}
	if cs != "utf-8" && cs != "iso-8859-1" {
		return "", lerr("unsupported charset")
	}
	for k, c := range rest {
		if c == '%' && !(k+2 < len(rest) && isHex(rest[k+1]) && isHex(rest[k+2])) {
			return "", lerr("bad percent-encoding")
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
			return "", lerr("invalid UTF-8")
		}
		return string(b), nil
	}
	out := make([]rune, len(b))
	for k, c := range b {
		out[k] = rune(c)
	}
	return string(out), nil
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

// Parse splits a Link header value into links.
func Parse(value string) ([]Link, error) {
	s := []rune(value)
	n, i := len(s), 0
	links := []Link{}
	ws := func() {
		for i < n && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
	}
	for {
		ws()
		if i >= n {
			break
		}
		if s[i] == ',' {
			i++
			continue
		}
		if s[i] != '<' {
			return nil, lerr("expected <")
		}
		end := -1
		for k := i; k < n; k++ {
			if s[k] == '>' {
				end = k
				break
			}
		}
		if end < 0 {
			return nil, lerr("unterminated <")
		}
		uri := string(s[i+1 : end])
		i = end + 1
		params := []Param{}
		has := map[string]bool{}
		ext := map[string]bool{}
		for {
			ws()
			if i >= n || s[i] == ',' {
				break
			}
			if s[i] != ';' {
				return nil, lerr("expected ;")
			}
			i++
			ws()
			start := i
			for i < n && isTokenChar(s[i]) {
				i++
			}
			if i == start {
				return nil, lerr("expected parameter name")
			}
			name := strings.ToLower(string(s[start:i]))
			ws()
			val := ""
			if i < n && s[i] == '=' {
				i++
				ws()
				if i < n && s[i] == '"' {
					i++
					var buf []rune
					for {
						if i >= n {
							return nil, lerr("unterminated quote")
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
					for i < n && s[i] != ',' && s[i] != ';' && !unicode.IsSpace(s[i]) {
						i++
					}
					val = string(s[start:i])
				}
			}
			if strings.HasSuffix(name, "*") {
				base := name[:len(name)-1]
				dec, err := decodeExt(val)
				if err != nil {
					return nil, err
				}
				params = setParam(params, base, dec)
				has[base], ext[base] = true, true
			} else if !ext[name] && !has[name] {
				params = append(params, Param{name, val})
				has[name] = true
			}
		}
		for k := range params {
			if params[k].Name == "rel" {
				params[k].Value = strings.Join(strings.Fields(strings.ToLower(params[k].Value)), " ")
			}
		}
		links = append(links, Link{uri, params})
	}
	return links, nil
}

// FindRel returns the first link whose rel list contains rel (case-insensitive), or nil.
func FindRel(links []Link, rel string) *Link {
	want := strings.ToLower(rel)
	for k := range links {
		v, _ := links[k].Get("rel")
		for _, r := range strings.Fields(v) {
			if r == want {
				return &links[k]
			}
		}
	}
	return nil
}

func isToken(v string) bool {
	if v == "" {
		return false
	}
	for _, c := range v {
		if !isTokenChar(c) {
			return false
		}
	}
	return true
}

// Format renders links as a Link header value; rel is always quoted and non-printable-ASCII values use the RFC 8187 name*=UTF-8 form.
func Format(links []Link) string {
	const attr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~"
	const hexd = "0123456789ABCDEF"
	out := make([]string, 0, len(links))
	for _, l := range links {
		parts := []string{"<" + l.URI + ">"}
		for _, p := range l.Params {
			plain := true
			for _, c := range p.Value {
				if c > 0x7e || c < 0x20 {
					plain = false
					break
				}
			}
			if !plain {
				var b strings.Builder
				b.WriteString(p.Name + "*=UTF-8''")
				for _, c := range p.Value {
					if c < 0x80 && strings.ContainsRune(attr, c) {
						b.WriteRune(c)
						continue
					}
					var buf [4]byte
					for _, x := range buf[:utf8.EncodeRune(buf[:], c)] {
						b.WriteByte('%')
						b.WriteByte(hexd[x>>4])
						b.WriteByte(hexd[x&15])
					}
				}
				parts = append(parts, b.String())
			} else if isToken(p.Value) && p.Name != "rel" {
				parts = append(parts, p.Name+"="+p.Value)
			} else {
				parts = append(parts, p.Name+"=\""+strings.ReplaceAll(strings.ReplaceAll(p.Value, "\\", "\\\\"), "\"", "\\\"")+"\"")
			}
		}
		out = append(out, strings.Join(parts, "; "))
	}
	return strings.Join(out, ", ")
}
