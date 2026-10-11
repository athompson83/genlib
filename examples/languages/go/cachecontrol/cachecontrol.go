// SPDX-License-Identifier: Apache-2.0

// Package cachecontrol parses and formats Cache-Control headers (RFC 9111) and
// computes freshness lifetimes. Names are lowercased and the first occurrence
// wins; delta directives (max-age, s-maxage, stale-while-revalidate,
// stale-if-error, max-stale, min-fresh) must be ASCII digits (quoted digits
// accepted) and become integers, invalid ones are dropped; a bare max-stale is a
// flag; unparseable items are skipped up to the next comma.
package cachecontrol

import (
	"errors"
	"math"
	"strconv"
	"strings"
)

// ErrSyntax is returned for an unterminated quoted string.
var ErrSyntax = errors.New("cachecontrol: unterminated quote")

// Kind tags a directive value.
type Kind int

const (
	// Flag is a directive without a value, such as no-store.
	Flag Kind = iota
	// Seconds is a delta-seconds value held in Value.Seconds.
	Seconds
	// Text is a string value held in Value.Text.
	Text
)

// Value is a tagged directive value: a flag, an integer number of seconds or a string.
type Value struct {
	Kind    Kind
	Seconds int64
	Text    string
}

// Directive is one name/value pair in header order.
type Directive struct {
	Name  string
	Value Value
}

var delta = map[string]bool{"max-age": true, "s-maxage": true, "stale-while-revalidate": true, "stale-if-error": true, "max-stale": true, "min-fresh": true}

func isTokenChar(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || strings.IndexByte("!#$%&'*+-.^_`|~", c) >= 0
}

func isToken(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if !isTokenChar(s[i]) {
			return false
		}
	}
	return true
}

// Parse reads a Cache-Control value into directives in header order; seconds beyond int64 saturate.
func Parse(value string) ([]Directive, error) {
	s := value
	n, i := len(s), 0
	out := []Directive{}
	seen := map[string]bool{}
	nextComma := func() {
		if j := strings.IndexByte(s[i:], ','); j >= 0 {
			i += j
		} else {
			i = n
		}
	}
	for i < n {
		for i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == ',') {
			i++
		}
		if i >= n {
			break
		}
		start := i
		for i < n && isTokenChar(s[i]) {
			i++
		}
		if i == start {
			nextComma()
			continue
		}
		name := strings.ToLower(s[start:i])
		val := Value{Kind: Flag}
		for i < n && (s[i] == ' ' || s[i] == '\t') {
			i++
		}
		if i < n && s[i] == '=' {
			i++
			for i < n && (s[i] == ' ' || s[i] == '\t') {
				i++
			}
			if i < n && s[i] == '"' {
				i++
				var b strings.Builder
				for {
					if i >= n {
						return nil, ErrSyntax
					}
					c := s[i]
					if c == '\\' && i+1 < n {
						b.WriteByte(s[i+1])
						i += 2
						continue
					}
					if c == '"' {
						i++
						break
					}
					b.WriteByte(c)
					i++
				}
				val = Value{Kind: Text, Text: b.String()}
			} else {
				start := i
				for i < n && isTokenChar(s[i]) {
					i++
				}
				val = Value{Kind: Text, Text: s[start:i]}
			}
		}
		nextComma()
		if delta[name] {
			if val.Kind == Flag && name != "max-stale" {
				continue
			}
			if val.Kind == Text {
				if val.Text == "" || strings.Trim(val.Text, "0123456789") != "" {
					continue
				}
				secs, err := strconv.ParseInt(val.Text, 10, 64)
				if err != nil {
					secs = math.MaxInt64
				}
				val = Value{Kind: Seconds, Seconds: secs}
			}
		}
		if !seen[name] {
			seen[name] = true
			out = append(out, Directive{name, val})
		}
	}
	return out, nil
}

// Format renders directives in order: flags as the bare name, seconds as name=N, strings quoted unless they are tokens.
func Format(ds []Directive) string {
	parts := make([]string, 0, len(ds))
	for _, d := range ds {
		switch d.Value.Kind {
		case Flag:
			parts = append(parts, d.Name)
		case Seconds:
			parts = append(parts, d.Name+"="+strconv.FormatInt(d.Value.Seconds, 10))
		default:
			if isToken(d.Value.Text) {
				parts = append(parts, d.Name+"="+d.Value.Text)
			} else {
				parts = append(parts, d.Name+"=\""+strings.ReplaceAll(strings.ReplaceAll(d.Value.Text, "\\", "\\\\"), "\"", "\\\"")+"\"")
			}
		}
	}
	return strings.Join(parts, ", ")
}

func find(ds []Directive, name string) (Value, bool) {
	for _, d := range ds {
		if d.Name == name {
			return d.Value, true
		}
	}
	return Value{}, false
}

// Freshness returns the freshness lifetime in seconds (0 for no-store/no-cache; shared caches prefer s-maxage) and false when none is given.
func Freshness(ds []Directive, shared bool) (int64, bool) {
	if _, ok := find(ds, "no-store"); ok {
		return 0, true
	}
	if _, ok := find(ds, "no-cache"); ok {
		return 0, true
	}
	if shared {
		if v, ok := find(ds, "s-maxage"); ok && v.Kind == Seconds {
			return v.Seconds, true
		}
	}
	if v, ok := find(ds, "max-age"); ok && v.Kind == Seconds {
		return v.Seconds, true
	}
	return 0, false
}
