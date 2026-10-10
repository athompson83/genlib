// SPDX-License-Identifier: Apache-2.0

// Package negotiation picks a response media type from Accept and a language
// from Accept-Language (RFC 9110 section 12.5, RFC 4647 basic filtering).
package negotiation

import (
	"strconv"
	"strings"
)

type item struct {
	value string
	q     float64
}

func validQ(v string) bool {
	if v == "" || (v[0] != '0' && v[0] != '1') {
		return false
	}
	if len(v) == 1 {
		return true
	}
	if v[1] != '.' || len(v) > 5 {
		return false
	}
	for i := 2; i < len(v); i++ {
		if v[i] < '0' || v[i] > '9' || (v[0] == '1' && v[i] != '0') {
			return false
		}
	}
	return true
}

func qValue(v string) float64 {
	q, _ := strconv.ParseFloat(strings.TrimSuffix(v, "."), 64)
	return q
}

func parse(header string) []item {
	var out []item
	for _, part := range strings.Split(header, ",") {
		part = strings.Trim(part, " \t")
		if part == "" {
			continue
		}
		bits := strings.Split(part, ";")
		q, ok := 1.0, true
		for _, p := range bits[1:] {
			k, v, _ := strings.Cut(strings.Trim(p, " \t"), "=")
			if strings.ToLower(strings.TrimSpace(k)) != "q" {
				continue
			}
			v = strings.TrimSpace(v)
			if !validQ(v) {
				ok = false
				break
			}
			q = qValue(v)
		}
		if ok {
			out = append(out, item{strings.ToLower(strings.Trim(bits[0], " \t")), q})
		}
	}
	return out
}

func tchar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.IndexByte("!#$%&'*+.^_`|~-", c) >= 0
}

func token(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !tchar(s[i]) {
			return false
		}
	}
	return true
}

func pick(items []item, available []string, specificity func(rng, avail string) int) (string, bool) {
	best, bq, found := "", 0.0, false
	for _, a := range available {
		spec, q := 0, 0.0
		for _, it := range items {
			if s := specificity(it.value, strings.ToLower(a)); s > spec {
				spec, q = s, it.q
			}
		}
		if spec > 0 && q > bq {
			best, bq, found = a, q, true
		}
	}
	return best, found
}

// NegotiateMediaType returns the best available media type for an Accept
// header ("" or blank means any: the first available), and false when none
// is acceptable. The most specific matching range sets each type's q; ties go
// to the earlier available entry.
func NegotiateMediaType(accept string, available []string) (string, bool) {
	if strings.TrimSpace(accept) == "" {
		if len(available) == 0 {
			return "", false
		}
		return available[0], true
	}
	var ranges []item
	for _, it := range parse(accept) {
		t, s, ok := strings.Cut(it.value, "/")
		if ok && token(t) && token(s) {
			ranges = append(ranges, it)
		}
	}
	return pick(ranges, available, func(rng, avail string) int {
		rt, rs, _ := strings.Cut(rng, "/")
		t, s, ok := strings.Cut(avail, "/")
		switch {
		case !ok:
			return 0
		case rt == t && rs == s:
			return 3
		case rt == t && rs == "*":
			return 2
		case rt == "*" && rs == "*":
			return 1
		}
		return 0
	})
}

func languageRange(r string) bool {
	if r == "*" {
		return true
	}
	for i, sub := range strings.Split(r, "-") {
		if sub == "" || len(sub) > 8 {
			return false
		}
		for j := 0; j < len(sub); j++ {
			c := sub[j]
			if !(c >= 'a' && c <= 'z' || i > 0 && c >= '0' && c <= '9') {
				return false
			}
		}
	}
	return true
}

// NegotiateLanguage returns the best available language tag (original case)
// for an Accept-Language header, using RFC 4647 basic filtering.
func NegotiateLanguage(acceptLanguage string, available []string) (string, bool) {
	if strings.TrimSpace(acceptLanguage) == "" {
		if len(available) == 0 {
			return "", false
		}
		return available[0], true
	}
	var ranges []item
	for _, it := range parse(acceptLanguage) {
		if languageRange(it.value) {
			ranges = append(ranges, it)
		}
	}
	return pick(ranges, available, func(rng, tag string) int {
		if rng == "*" {
			return 1
		}
		if tag == rng || strings.HasPrefix(tag, rng+"-") {
			return 2 + strings.Count(rng, "-")
		}
		return 0
	})
}
