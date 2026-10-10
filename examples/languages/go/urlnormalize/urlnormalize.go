// SPDX-License-Identifier: Apache-2.0

// Package urlnormalize applies RFC 3986 section 6 normalization to http and
// https URLs (hand-parsed, so results match every other Genlib language):
// lowercase scheme and host, default port removed, percent-encoding
// normalized, dot segments removed, empty path "/", fragment dropped.
package urlnormalize

import (
	"errors"
	"strconv"
	"strings"

	"genlib/examples/pagination/ipcidr"
)

// RemoveDotSegments implements RFC 3986 section 5.2.4.
func RemoveDotSegments(path string) string {
	in, out := path, ""
	popLast := func() {
		if i := strings.LastIndex(out, "/"); i >= 0 {
			out = out[:i]
		} else {
			out = ""
		}
	}
	for in != "" {
		switch {
		case strings.HasPrefix(in, "../"):
			in = in[3:]
		case strings.HasPrefix(in, "./"):
			in = in[2:]
		case strings.HasPrefix(in, "/./"):
			in = "/" + in[3:]
		case in == "/.":
			in = "/"
		case strings.HasPrefix(in, "/../"):
			in = "/" + in[4:]
			popLast()
		case in == "/..":
			in = "/"
			popLast()
		case in == "." || in == "..":
			in = ""
		default:
			start := 0
			if strings.HasPrefix(in, "/") {
				start = 1
			}
			i := strings.Index(in[start:], "/")
			if i < 0 {
				out += in
				in = ""
			} else {
				out += in[:start+i]
				in = in[start+i:]
			}
		}
	}
	return out
}

func hexVal(c byte) int {
	switch {
	case c >= '0' && c <= '9':
		return int(c - '0')
	case c >= 'a' && c <= 'f':
		return int(c-'a') + 10
	case c >= 'A' && c <= 'F':
		return int(c-'A') + 10
	}
	return -1
}

func unreserved(c byte) bool {
	return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~'
}

var errURL = errors.New("urlnormalize: invalid http(s) URL")

func normalizePercent(s string) (string, error) {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] != '%' {
			b.WriteByte(s[i])
			continue
		}
		if i+2 >= len(s) || hexVal(s[i+1]) < 0 || hexVal(s[i+2]) < 0 {
			return "", errors.New("urlnormalize: % must be followed by two hex digits")
		}
		c := byte(hexVal(s[i+1])<<4 | hexVal(s[i+2]))
		if unreserved(c) {
			b.WriteByte(c)
		} else {
			b.WriteString("%" + strings.ToUpper(s[i+1:i+3]))
		}
		i += 2
	}
	return b.String(), nil
}

func allBytes(s string, ok func(byte) bool) bool {
	for i := 0; i < len(s); i++ {
		if !ok(s[i]) {
			return false
		}
	}
	return true
}

// Normalize returns the normalized form of an absolute http(s) URL. Userinfo,
// whitespace, controls, bad percent-encodings and bad ports are errors.
func Normalize(text string) (string, error) {
	for _, r := range text {
		if r <= 0x20 || r == 0x7f {
			return "", errURL
		}
	}
	colon := strings.Index(text, ":")
	if colon < 1 || !strings.HasPrefix(text[colon:], "://") {
		return "", errURL
	}
	scheme := strings.ToLower(text[:colon])
	if scheme != "http" && scheme != "https" {
		return "", errURL
	}
	rest := text[colon+3:]
	if i := strings.Index(rest, "#"); i >= 0 {
		rest = rest[:i]
	}
	query := ""
	if i := strings.Index(rest, "?"); i >= 0 {
		rest, query = rest[:i], rest[i:]
	}
	authority, path := rest, ""
	if i := strings.Index(rest, "/"); i >= 0 {
		authority, path = rest[:i], rest[i:]
	}
	if strings.Contains(authority, "@") {
		return "", errURL
	}
	host, port := authority, ""
	hasPort := false
	if strings.HasPrefix(authority, "[") {
		end := strings.Index(authority, "]")
		if end < 0 {
			return "", errURL
		}
		inner := authority[1:end]
		if inner == "" || !allBytes(inner, func(c byte) bool { return hexVal(c) >= 0 || c == ':' || c == '.' }) {
			return "", errURL
		}
		canonical, err := ipcidr.CanonicalIP(strings.ToLower(inner))
		if err != nil {
			return "", err
		}
		host = "[" + canonical + "]"
		tail := authority[end+1:]
		if tail != "" {
			if tail[0] != ':' {
				return "", errURL
			}
			port, hasPort = tail[1:], true
		}
	} else {
		if i := strings.Index(authority, ":"); i >= 0 {
			host, port, hasPort = authority[:i], authority[i+1:], true
		}
		if host == "" || !allBytes(host, func(c byte) bool { return unreserved(c) && c != '_' && c != '~' }) {
			return "", errURL
		}
		host = strings.ToLower(host)
	}
	if hasPort && port != "" {
		if !allBytes(port, func(c byte) bool { return c >= '0' && c <= '9' }) {
			return "", errURL
		}
		digits := strings.TrimLeft(port, "0")
		p, err := strconv.ParseUint("0"+digits, 10, 32)
		if len(digits) > 5 || err != nil || p > 65535 {
			return "", errors.New("urlnormalize: port must be 0-65535")
		}
		if (scheme == "http" && p == 80) || (scheme == "https" && p == 443) {
			port = ""
		} else {
			port = strconv.FormatUint(p, 10)
		}
	}
	path, err := normalizePercent(path)
	if err != nil {
		return "", err
	}
	path = RemoveDotSegments(path)
	if path == "" {
		path = "/"
	}
	if query, err = normalizePercent(query); err != nil {
		return "", err
	}
	if query == "?" {
		query = ""
	}
	out := scheme + "://" + host
	if port != "" {
		out += ":" + port
	}
	return out + path + query, nil
}
