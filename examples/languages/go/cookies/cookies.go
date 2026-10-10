// SPDX-License-Identifier: Apache-2.0

// Package cookies serializes Set-Cookie values (RFC 6265 plus current browser
// rules for SameSite, Partitioned and the __Secure-/__Host- prefixes) and
// parses Cookie request headers.
package cookies

import (
	"errors"
	"strconv"
	"strings"
)

// Options are the Set-Cookie attributes. Nil pointers and empty SameSite are
// not written. SameSite must be "Strict", "Lax" or "None" (exact case).
type Options struct {
	MaxAge      *int64
	Expires     *int64 // unix seconds, written as an IMF-fixdate
	Domain      *string
	Path        *string
	Secure      bool
	HTTPOnly    bool
	SameSite    string
	Partitioned bool
}

func tchar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.IndexByte("!#$%&'*+-.^_`|~", c) >= 0
}

func cookieOctet(c byte) bool {
	return c == 0x21 || (c >= 0x23 && c <= 0x2b) || (c >= 0x2d && c <= 0x3a) || (c >= 0x3c && c <= 0x5b) || (c >= 0x5d && c <= 0x7e)
}

func all(s string, ok func(byte) bool) bool {
	for i := 0; i < len(s); i++ {
		if !ok(s[i]) {
			return false
		}
	}
	return true
}

func alnum(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9'
}

func validDomain(d string) bool {
	d = strings.TrimPrefix(d, ".")
	for _, label := range strings.Split(d, ".") {
		if label == "" || !alnum(label[0]) || !alnum(label[len(label)-1]) || !all(label, func(c byte) bool { return alnum(c) || c == '-' }) {
			return false
		}
	}
	return true
}

var (
	days   = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	months = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
)

func floorDiv(a, b int64) int64 {
	q := a / b
	if a%b != 0 && (a < 0) != (b < 0) {
		q--
	}
	return q
}

func pad(n int64, w int) string {
	s := strconv.FormatInt(n, 10)
	for len(s) < w {
		s = "0" + s
	}
	return s
}

// IMFFixdate formats unix seconds as "Wed, 21 Oct 2026 07:28:00 GMT".
func IMFFixdate(unix int64) string {
	day := floorDiv(unix, 86400)
	sec := unix - day*86400
	z := day + 719468
	era := floorDiv(z, 146097)
	doe := z - era*146097
	yoe := (doe - doe/1460 + doe/36524 - doe/146096) / 365
	doy := doe - (365*yoe + yoe/4 - yoe/100)
	mp := (5*doy + 2) / 153
	d := doy - (153*mp+2)/5 + 1
	m := mp + 3
	if m > 12 {
		m -= 12
	}
	y := yoe + era*400
	if m <= 2 {
		y++
	}
	wd := (day%7 + 7 + 3) % 7 // 1970-01-01 was a Thursday
	return days[wd] + ", " + pad(d, 2) + " " + months[m-1] + " " + pad(y, 4) + " " + pad(sec/3600, 2) + ":" + pad(sec/60%60, 2) + ":" + pad(sec%60, 2) + " GMT"
}

// Serialize builds a Set-Cookie header value. The caller encodes values that
// contain characters outside cookie-octet.
func Serialize(name, value string, o Options) (string, error) {
	switch {
	case name == "" || !all(name, tchar):
		return "", errors.New("cookies: name must be an RFC 7230 token")
	case !all(value, cookieOctet):
		return "", errors.New("cookies: value has characters outside cookie-octet; encode it first")
	case o.Domain != nil && !validDomain(*o.Domain):
		return "", errors.New("cookies: invalid domain")
	case o.Path != nil && (!strings.HasPrefix(*o.Path, "/") || !all(*o.Path, func(c byte) bool { return c >= 0x20 && c != 0x7f && c != ';' })):
		return "", errors.New("cookies: path must start with / and contain no controls or ;")
	case o.SameSite != "" && o.SameSite != "Strict" && o.SameSite != "Lax" && o.SameSite != "None":
		return "", errors.New("cookies: SameSite must be Strict, Lax or None")
	case o.SameSite == "None" && !o.Secure:
		return "", errors.New("cookies: SameSite=None requires Secure")
	case o.Partitioned && !o.Secure:
		return "", errors.New("cookies: Partitioned requires Secure")
	case strings.HasPrefix(name, "__Secure-") && !o.Secure:
		return "", errors.New("cookies: __Secure- requires Secure")
	case strings.HasPrefix(name, "__Host-") && (!o.Secure || o.Domain != nil || o.Path == nil || *o.Path != "/"):
		return "", errors.New("cookies: __Host- requires Secure, Path=/ and no Domain")
	case o.MaxAge != nil && *o.MaxAge < 0:
		return "", errors.New("cookies: Max-Age must be a non-negative integer")
	}
	out := []string{name + "=" + value}
	if o.MaxAge != nil {
		out = append(out, "Max-Age="+strconv.FormatInt(*o.MaxAge, 10))
	}
	if o.Expires != nil {
		out = append(out, "Expires="+IMFFixdate(*o.Expires))
	}
	if o.Domain != nil {
		out = append(out, "Domain="+strings.ToLower(*o.Domain))
	}
	if o.Path != nil {
		out = append(out, "Path="+*o.Path)
	}
	if o.Secure {
		out = append(out, "Secure")
	}
	if o.HTTPOnly {
		out = append(out, "HttpOnly")
	}
	if o.SameSite != "" {
		out = append(out, "SameSite="+o.SameSite)
	}
	if o.Partitioned {
		out = append(out, "Partitioned")
	}
	return strings.Join(out, "; "), nil
}

// ParseHeader splits a Cookie request header into ordered [name, value]
// pairs, keeping duplicates.
func ParseHeader(header string) [][2]string {
	out := [][2]string{}
	for _, piece := range strings.Split(header, ";") {
		n, v, ok := strings.Cut(piece, "=")
		if !ok {
			continue
		}
		n, v = strings.Trim(n, " \t"), strings.Trim(v, " \t")
		if n == "" {
			continue
		}
		if len(v) >= 2 && v[0] == '"' && v[len(v)-1] == '"' {
			v = v[1 : len(v)-1]
		}
		out = append(out, [2]string{n, v})
	}
	return out
}
