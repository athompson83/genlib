// SPDX-License-Identifier: Apache-2.0

// Package conditional parses entity tags and evaluates conditional request
// headers in RFC 9110 section 13.2.2 order.
package conditional

import "strings"

// ETags is a parsed If-Match / If-None-Match value: Any for "*", otherwise
// the valid entity tags in order (invalid items are ignored).
type ETags struct {
	Any  bool
	Tags []string
}

func etagc(r rune) bool {
	return r == 0x21 || (r >= 0x23 && r <= 0x7e) || (r >= 0x80 && r <= 0xff)
}

func validETag(s string) bool {
	s = strings.TrimPrefix(s, "W/")
	if len(s) < 2 || s[0] != '"' || s[len(s)-1] != '"' {
		return false
	}
	for _, r := range s[1 : len(s)-1] {
		if !etagc(r) {
			return false
		}
	}
	return true
}

// ParseETags parses a comma-separated entity-tag list or "*".
func ParseETags(header string) ETags {
	h := strings.Trim(header, " \t")
	if h == "*" {
		return ETags{Any: true}
	}
	out := ETags{Tags: []string{}}
	for _, part := range strings.Split(h, ",") {
		if p := strings.Trim(part, " \t"); validETag(p) {
			out.Tags = append(out.Tags, p)
		}
	}
	return out
}

// StrongMatch: neither tag is weak and both are identical.
func StrongMatch(a, b string) bool {
	return !strings.HasPrefix(a, "W/") && !strings.HasPrefix(b, "W/") && a == b
}

// WeakMatch: identical after removing a leading "W/".
func WeakMatch(a, b string) bool {
	return strings.TrimPrefix(a, "W/") == strings.TrimPrefix(b, "W/")
}

// Request holds the current representation's validators and the request's
// conditional headers. A nil pointer means absent / not sent.
type Request struct {
	Method            string
	ETag              *string
	LastModified      *int64 // unix seconds
	IfMatch           *string
	IfNoneMatch       *string
	IfModifiedSince   *string
	IfUnmodifiedSince *string
}

var (
	days   = []string{"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
	months = []string{"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"}
)

func daysFromCivil(y, m, d int64) int64 {
	if m <= 2 {
		y--
	}
	era := y / 400
	if y < 0 && y%400 != 0 {
		era--
	}
	yoe := y - era*400
	mp := (m + 9) % 12
	doy := (153*mp+2)/5 + d - 1
	doe := yoe*365 + yoe/4 - yoe/100 + doy
	return era*146097 + doe - 719468
}

func monthDays(y, m int64) int64 {
	switch m {
	case 2:
		if y%4 == 0 && (y%100 != 0 || y%400 == 0) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

func num(s string) (int64, bool) {
	var n int64
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
		n = n*10 + int64(s[i]-'0')
	}
	return n, true
}

func index(list []string, s string) int64 {
	for i, v := range list {
		if v == s {
			return int64(i)
		}
	}
	return -1
}

// ParseHTTPDate parses an IMF-fixdate ("Wed, 21 Oct 2026 07:28:00 GMT") that
// round-trips exactly, including the weekday, into unix seconds.
func ParseHTTPDate(s string) (int64, bool) {
	if len(s) != 29 || s[3:5] != ", " || s[7] != ' ' || s[11] != ' ' || s[16] != ' ' || s[19] != ':' || s[22] != ':' || s[25:] != " GMT" {
		return 0, false
	}
	d, ok1 := num(s[5:7])
	y, ok2 := num(s[12:16])
	hh, ok3 := num(s[17:19])
	mm, ok4 := num(s[20:22])
	ss, ok5 := num(s[23:25])
	m := index(months, s[8:11]) + 1
	if !(ok1 && ok2 && ok3 && ok4 && ok5) || m < 1 || y < 1 || d < 1 || d > monthDays(y, m) || hh > 23 || mm > 59 || ss > 59 {
		return 0, false
	}
	day := daysFromCivil(y, m, d)
	wd := ((day+3)%7 + 7) % 7 // 1970-01-01 was a Thursday
	if days[wd] != s[:3] {
		return 0, false
	}
	return day*86400 + hh*3600 + mm*60 + ss, true
}

// Evaluate returns 200, 304 or 412 for the request.
func Evaluate(r Request) int {
	safe := r.Method == "GET" || r.Method == "HEAD"
	if r.IfMatch != nil {
		tags := ParseETags(*r.IfMatch)
		if tags.Any {
			if r.ETag == nil {
				return 412
			}
		} else {
			hit := false
			for _, t := range tags.Tags {
				hit = hit || (r.ETag != nil && StrongMatch(t, *r.ETag))
			}
			if !hit {
				return 412
			}
		}
	} else if r.IfUnmodifiedSince != nil && r.LastModified != nil {
		if d, ok := ParseHTTPDate(*r.IfUnmodifiedSince); ok && *r.LastModified > d {
			return 412
		}
	}
	if r.IfNoneMatch != nil {
		tags := ParseETags(*r.IfNoneMatch)
		hit := tags.Any && r.ETag != nil
		for _, t := range tags.Tags {
			hit = hit || (r.ETag != nil && WeakMatch(t, *r.ETag))
		}
		if hit {
			if safe {
				return 304
			}
			return 412
		}
	} else if r.IfModifiedSince != nil && safe && r.LastModified != nil {
		if d, ok := ParseHTTPDate(*r.IfModifiedSince); ok && *r.LastModified <= d {
			return 304
		}
	}
	return 200
}
