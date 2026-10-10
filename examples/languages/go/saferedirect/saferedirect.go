// SPDX-License-Identifier: Apache-2.0

// Package saferedirect guards post-login and "next" redirects against open
// redirects. Same-site paths ("/x", not "//x") are allowed; absolute URLs are
// allowed only when their http(s) origin exactly matches an allowed origin.
// Everything else, including javascript: URLs, backslashes, control
// characters and userinfo, falls back to a safe default.
package saferedirect

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// MaxLength is the longest accepted target, in characters.
const MaxLength = 2048

var absolute = regexp.MustCompile(`^([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\?[^#]*)?(#.*)?$`)

// origin returns "scheme://host[:port]" (lowercase, default port dropped), or
// "" when url is not an acceptable absolute http(s) URL.
func origin(url string) string {
	m := absolute.FindStringSubmatch(url)
	if m == nil {
		return ""
	}
	scheme, host, port := strings.ToLower(m[1]), strings.ToLower(m[2]), m[3]
	if strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") || strings.Contains(host, "..") {
		return ""
	}
	if port != "" {
		p, _ := strconv.Atoi(port)
		if p < 1 || p > 65535 {
			return ""
		}
		if (scheme == "https" && p == 443) || (scheme == "http" && p == 80) {
			port = ""
		} else {
			port = strconv.Itoa(p)
		}
	}
	if port != "" {
		return scheme + "://" + host + ":" + port
	}
	return scheme + "://" + host
}

// SafeRedirect returns target when it is safe to redirect to, otherwise
// fallback. allowedOrigins are absolute http(s) URLs whose origins may be
// redirected to.
func SafeRedirect(target string, allowedOrigins []string, fallback string) string {
	if target == "" || utf8.RuneCountInString(target) > MaxLength || strings.Contains(target, "\\") {
		return fallback
	}
	for i := 0; i < len(target); i++ {
		if target[i] <= 0x20 || target[i] == 0x7f {
			return fallback
		}
	}
	if strings.HasPrefix(target, "/") {
		if strings.HasPrefix(target, "//") {
			return fallback
		}
		return target
	}
	o := origin(target)
	if o == "" {
		return fallback
	}
	for _, a := range allowedOrigins {
		if origin(a) == o {
			return target
		}
	}
	return fallback
}
