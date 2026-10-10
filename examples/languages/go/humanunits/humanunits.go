// SPDX-License-Identifier: Apache-2.0

// Package humanunits formats and parses byte sizes, formats durations and
// writes relative times ("in 3 minutes", "2 years ago"). All rounding is
// half up in integer arithmetic, so results never depend on floating point.
package humanunits

import (
	"errors"
	"math"
	"math/bits"
	"strconv"
	"strings"
	"unicode"
)

// Base selects decimal (SI: kB = 1000 B) or binary (IEC: KiB = 1024 B) units.
type Base int

const (
	// SI uses kB MB GB TB PB EB (powers of 1000).
	SI Base = iota
	// IEC uses KiB MiB GiB TiB PiB EiB (powers of 1024).
	IEC
)

var (
	siUnits  = [...]string{"B", "kB", "MB", "GB", "TB", "PB", "EB"}
	iecUnits = [...]string{"B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"}
)

func pow(step uint64, e int) uint64 {
	r := uint64(1)
	for ; e > 0; e-- {
		r *= step
	}
	return r
}

// roundDiv returns n*m/d rounded half up for d > 0 and n*m/d < 2^64.
func roundDiv(n, m, d uint64) uint64 {
	hi, lo := bits.Mul64(n, m)
	q, r := bits.Div64(hi, lo, d)
	if r >= d-r {
		q++
	}
	return q
}

// FormatBytes formats n with up to decimals (0..3) fraction digits, trailing
// zeros removed: 1536 -> "1.5 KiB" (IEC) or "1.5 kB" (SI).
func FormatBytes(n int64, base Base, decimals int) (string, error) {
	if n < 0 || decimals < 0 || decimals > 3 || (base != SI && base != IEC) {
		return "", errors.New("humanunits: need n >= 0 and decimals 0..3")
	}
	units, step := siUnits, uint64(1000)
	if base == IEC {
		units, step = iecUnits, 1024
	}
	u := uint64(n)
	if u < step {
		return strconv.FormatUint(u, 10) + " B", nil
	}
	i := 1
	for i < 6 && u >= pow(step, i+1) {
		i++
	}
	scale := pow(10, decimals)
	v := roundDiv(u, scale, pow(step, i))
	if v >= step*scale && i < 6 {
		i++
		v = roundDiv(u, scale, pow(step, i))
	}
	s := strconv.FormatUint(v/scale, 10)
	if decimals > 0 {
		frac := strconv.FormatUint(v%scale, 10)
		frac = strings.TrimRight(strings.Repeat("0", decimals-len(frac))+frac, "0")
		if frac != "" {
			s += "." + frac
		}
	}
	return s + " " + units[i], nil
}

var parseUnits = map[string]uint64{
	"": 1, "b": 1, "kb": 1e3, "mb": 1e6, "gb": 1e9, "tb": 1e12, "pb": 1e15, "eb": 1e18,
	"kib": 1 << 10, "mib": 1 << 20, "gib": 1 << 30, "tib": 1 << 40, "pib": 1 << 50, "eib": 1 << 60,
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// ParseBytes parses "1.5 GiB", "2.25MB", " 10 b " or "512" (bytes) into a
// byte count rounded half up. Units are case-insensitive; signs, exponents
// and a leading "." are rejected, as are results above 2^63-1.
func ParseBytes(text string) (int64, error) {
	fail := errors.New("humanunits: invalid byte size")
	t := strings.TrimFunc(text, unicode.IsSpace)
	i := 0
	for i < len(t) && isDigit(t[i]) {
		i++
	}
	intPart := t[:i]
	if intPart == "" {
		return 0, fail
	}
	frac := ""
	if i < len(t) && t[i] == '.' {
		j := i + 1
		for j < len(t) && isDigit(t[j]) {
			j++
		}
		if j == i+1 {
			return 0, fail
		}
		frac, i = t[i+1:j], j
	}
	unit := strings.TrimLeftFunc(t[i:], unicode.IsSpace)
	for k := 0; k < len(unit); k++ {
		c := unit[k]
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z') {
			return 0, fail
		}
	}
	mult, ok := parseUnits[strings.ToLower(unit)]
	if !ok {
		return 0, fail
	}
	whole := uint64(0)
	for k := 0; k < len(intPart); k++ {
		whole = whole*10 + uint64(intPart[k]-'0')
		if whole > math.MaxInt64 {
			return 0, fail
		}
	}
	// Multiply the decimal fraction by mult digit by digit from the right:
	// the final carry is floor(mult * 0.frac) and the most significant
	// product digit decides rounding.
	carry, top := uint64(0), uint64(0)
	for k := len(frac) - 1; k >= 0; k-- {
		x := uint64(frac[k]-'0')*mult + carry
		carry, top = x/10, x%10
	}
	hi, lo := bits.Mul64(whole, mult)
	sum, c1 := bits.Add64(lo, carry, 0)
	if top >= 5 {
		var c2 uint64
		sum, c2 = bits.Add64(sum, 1, 0)
		c1 += c2
	}
	if hi != 0 || c1 != 0 || sum > math.MaxInt64 {
		return 0, fail
	}
	return int64(sum), nil
}

// FormatDuration formats milliseconds: below one second "850ms", otherwise
// the two largest non-zero units of d, h, m, s ("1h 2m", "1d 1h", "45s").
func FormatDuration(ms int64) (string, error) {
	if ms < 0 {
		return "", errors.New("humanunits: duration must be >= 0")
	}
	if ms < 1000 {
		return strconv.FormatInt(ms, 10) + "ms", nil
	}
	s := ms / 1000
	var parts []string
	for _, u := range []struct {
		name string
		size int64
	}{{"d", 86400}, {"h", 3600}, {"m", 60}, {"s", 1}} {
		if q := s / u.size; q > 0 && len(parts) < 2 {
			parts = append(parts, strconv.FormatInt(q, 10)+u.name)
		}
		s %= u.size
	}
	return strings.Join(parts, " "), nil
}

func half(n, d uint64) uint64 {
	q, r := n/d, n%d
	if r >= d-r {
		q++
	}
	return q
}

// RelativeTime describes deltaSeconds (positive = future) as "just now",
// "in a minute", "3 hours ago", "in 2 months" or "10 years ago" using the
// thresholds 45 s, 90 s, 45 min, 90 min, 22 h, 36 h, 26 d, 46 d, 320 d and
// 548 d, an average Gregorian month (2629746 s) and year (31556952 s).
func RelativeTime(deltaSeconds int64) string {
	a := uint64(deltaSeconds)
	if deltaSeconds < 0 {
		a = -a
	}
	n := func(d uint64, unit string) string { return strconv.FormatUint(half(a, d), 10) + " " + unit }
	var p string
	switch {
	case a < 45:
		return "just now"
	case a < 90:
		p = "a minute"
	case a < 45*60:
		p = n(60, "minutes")
	case a < 90*60:
		p = "an hour"
	case a < 22*3600:
		p = n(3600, "hours")
	case a < 36*3600:
		p = "a day"
	case a < 26*86400:
		p = n(86400, "days")
	case a < 46*86400:
		p = "a month"
	case a < 320*86400:
		p = n(2629746, "months")
	case a < 548*86400:
		p = "a year"
	default:
		p = n(31556952, "years")
	}
	if deltaSeconds > 0 {
		return "in " + p
	}
	return p + " ago"
}
