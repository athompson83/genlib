// SPDX-License-Identifier: Apache-2.0

// Package datauri parses and builds data: URLs (RFC 2397 with simplified WHATWG
// rules). Parse lowercases the media type (an empty or invalid one becomes
// text/plain with charset US-ASCII unless a charset is given), percent-decodes
// the body to bytes (an invalid '%' stays literal) and decodes strict base64
// when the header ends in ";base64". Build picks base64 unless the type is
// textual and the bytes are valid UTF-8.
package datauri

import (
	"encoding/base64"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ErrInvalid is wrapped by every parse and build error.
var ErrInvalid = errors.New("datauri: invalid")

func derr(msg string) error { return &dataError{msg} }

type dataError struct{ msg string }

func (e *dataError) Error() string { return "datauri: " + e.msg }
func (e *dataError) Unwrap() error { return ErrInvalid }

// Param is one media-type parameter; names are lowercased, values kept as given.
type Param struct {
	Name, Value string
}

// DataURI is a parsed data: URL.
type DataURI struct {
	Mime   string
	Params []Param
	Base64 bool
	Data   []byte
}

func isTokenChar(c rune) bool {
	return c < 0x80 && (c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || strings.ContainsRune("!#$%&'*+-.^_`|~", c))
}

// tokenEnd returns the end of the token starting at i (i when there is none).
func tokenEnd(s []rune, i int) int {
	for i < len(s) && isTokenChar(s[i]) {
		i++
	}
	return i
}

func isTypeToken(s string) bool {
	r := []rune(s)
	i := tokenEnd(r, 0)
	if i == 0 || i >= len(r) || r[i] != '/' {
		return false
	}
	j := tokenEnd(r, i+1)
	return j > i+1 && j == len(r)
}

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

func pctDecode(s string) []byte {
	b := []byte(s)
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
	return out
}

// Parse decodes a data: URL into its media type, parameters, base64 flag and bytes.
func Parse(url string) (DataURI, error) {
	if len(url) < 5 || strings.ToLower(url[:5]) != "data:" {
		return DataURI{}, derr("not a data: URL")
	}
	rest := url[5:]
	comma := strings.IndexByte(rest, ',')
	if comma < 0 {
		return DataURI{}, derr("missing comma")
	}
	header, body := strings.TrimSpace(rest[:comma]), rest[comma+1:]
	isB64 := false
	if t := strings.TrimRightFunc(header, unicode.IsSpace); len(t) >= 6 && strings.ToLower(t[len(t)-6:]) == "base64" {
		before := strings.TrimRightFunc(t[:len(t)-6], unicode.IsSpace)
		if strings.HasSuffix(before, ";") {
			isB64, header = true, before[:len(before)-1]
		}
	}
	parts := strings.Split(header, ";")
	mime := strings.ToLower(strings.TrimSpace(parts[0]))
	var params []Param
	seen := map[string]bool{}
	for _, p := range parts[1:] {
		if i := strings.IndexByte(p, '='); i >= 0 {
			k := strings.ToLower(strings.TrimSpace(p[:i]))
			if k != "" && !seen[k] {
				seen[k] = true
				params = append(params, Param{k, strings.TrimSpace(p[i+1:])})
			}
		}
	}
	if !isTypeToken(mime) {
		mime = "text/plain"
		if !seen["charset"] {
			params = append([]Param{{"charset", "US-ASCII"}}, params...)
		}
	}
	if params == nil {
		params = []Param{}
	}
	data := pctDecode(body)
	if isB64 {
		s := make([]byte, 0, len(data))
		for _, c := range data {
			if c != '\t' && c != '\n' && c != '\f' && c != '\r' && c != ' ' {
				s = append(s, c)
			}
		}
		if len(s) >= 2 && s[len(s)-1] == '=' && s[len(s)-2] == '=' {
			s = s[:len(s)-2]
		} else if len(s) >= 1 && s[len(s)-1] == '=' {
			s = s[:len(s)-1]
		}
		if len(s)%4 == 1 {
			return DataURI{}, derr("invalid base64")
		}
		for _, c := range s {
			if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '+' || c == '/') {
				return DataURI{}, derr("invalid base64")
			}
		}
		dec, err := base64.RawStdEncoding.DecodeString(string(s))
		if err != nil {
			return DataURI{}, derr("invalid base64")
		}
		data = dec
	}
	return DataURI{Mime: mime, Params: params, Base64: isB64, Data: data}, nil
}

func isSpace(r rune) bool { return unicode.IsSpace(r) }

// validMediaType checks token/token followed by any number of ";name=value" parameters (optional spaces around ';').
func validMediaType(m string) bool {
	r := []rune(m)
	i := tokenEnd(r, 0)
	if i == 0 || i >= len(r) || r[i] != '/' {
		return false
	}
	j := tokenEnd(r, i+1)
	if j == i+1 {
		return false
	}
	for j < len(r) {
		for j < len(r) && isSpace(r[j]) {
			j++
		}
		if j >= len(r) || r[j] != ';' {
			return false
		}
		j++
		for j < len(r) && isSpace(r[j]) {
			j++
		}
		k := tokenEnd(r, j)
		if k == j || k >= len(r) || r[k] != '=' {
			return false
		}
		v := k + 1
		for v < len(r) && r[v] != ';' && r[v] != ',' && !isSpace(r[v]) {
			v++
		}
		if v == k+1 {
			return false
		}
		j = v
	}
	return true
}

const keep = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,"

// Build encodes data as a data: URL; an empty mime means application/octet-stream and a nil useBase64 chooses automatically.
func Build(data []byte, mime string, useBase64 *bool) (string, error) {
	if mime == "" {
		mime = "application/octet-stream"
	}
	if !validMediaType(mime) {
		return "", derr("invalid media type")
	}
	var b64 bool
	if useBase64 != nil {
		b64 = *useBase64
	} else {
		base := strings.ToLower(strings.TrimSpace(strings.SplitN(mime, ";", 2)[0]))
		textual := strings.HasPrefix(base, "text/") || strings.HasSuffix(base, "+json") || strings.HasSuffix(base, "+xml") ||
			base == "application/json" || base == "application/xml" || base == "application/javascript"
		b64 = !(textual && utf8.Valid(data))
	}
	if b64 {
		return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data), nil
	}
	const hexd = "0123456789ABCDEF"
	var sb strings.Builder
	sb.WriteString("data:" + mime + ",")
	for _, c := range data {
		if strings.IndexByte(keep, c) >= 0 {
			sb.WriteByte(c)
		} else {
			sb.WriteByte('%')
			sb.WriteByte(hexd[c>>4])
			sb.WriteByte(hexd[c&15])
		}
	}
	return sb.String(), nil
}
