// SPDX-License-Identifier: Apache-2.0

// Package isoduration parses, measures and formats ISO 8601 durations such as
// "P1DT2H30M" and "PT0.5S". Years and months are calendar dependent, so they
// parse but have no exact length; weeks are 7 days and days are 24 hours.
package isoduration

import (
	"errors"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// Duration holds the parsed components; fractional seconds are folded into
// Milliseconds.
type Duration struct {
	Years, Months, Weeks, Days, Hours, Minutes, Milliseconds int64
}

var grammar = regexp.MustCompile(`^P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\.([0-9]{1,3}))?S)?)?$`)

var errInvalid = errors.New("isoduration: invalid ISO 8601 duration")

// Parse reads an uppercase ISO 8601 duration with at least one component;
// only seconds may have a fraction (1-3 digits).
func Parse(s string) (Duration, error) {
	m := grammar.FindStringSubmatch(s)
	if m == nil || s == "P" || strings.HasSuffix(s, "T") {
		return Duration{}, errInvalid
	}
	var v [7]int64
	found := false
	for i := 0; i < 7; i++ {
		if m[i+1] == "" {
			continue
		}
		found = true
		n, err := strconv.ParseInt(m[i+1], 10, 64)
		if err != nil {
			return Duration{}, errors.New("isoduration: component out of range")
		}
		v[i] = n
	}
	if !found {
		return Duration{}, errInvalid
	}
	if v[6] > math.MaxInt64/1000-1 {
		return Duration{}, errors.New("isoduration: seconds out of range")
	}
	ms := v[6] * 1000
	if frac := m[8]; frac != "" {
		f, _ := strconv.ParseInt(frac+strings.Repeat("0", 3-len(frac)), 10, 64)
		ms += f
	}
	return Duration{v[0], v[1], v[2], v[3], v[4], v[5], ms}, nil
}

func mulAdd(acc, factor, add int64) (int64, error) {
	if acc > (math.MaxInt64-add)/factor {
		return 0, errors.New("isoduration: duration overflows int64 milliseconds")
	}
	return acc*factor + add, nil
}

// Milliseconds returns the exact length of d; it fails when years or months
// are non-zero because their length depends on the calendar.
func Milliseconds(d Duration) (int64, error) {
	if d.Years != 0 || d.Months != 0 {
		return 0, errors.New("isoduration: years and months have no exact length")
	}
	total := d.Weeks
	var err error
	for _, step := range [][2]int64{{7, d.Days}, {24, d.Hours}, {60, d.Minutes}, {60, 0}, {1000, d.Milliseconds}} {
		if total, err = mulAdd(total, step[0], step[1]); err != nil {
			return 0, err
		}
	}
	return total, nil
}

// Format renders non-negative milliseconds using days, hours, minutes and
// seconds (up to 3 fractional digits); zero is "PT0S".
func Format(ms int64) (string, error) {
	if ms < 0 {
		return "", errors.New("isoduration: milliseconds must be >= 0")
	}
	d, r := ms/86400000, ms%86400000
	h, r := r/3600000, r%3600000
	mi, r := r/60000, r%60000
	s, f := r/1000, r%1000
	var b strings.Builder
	b.WriteString("P")
	if d > 0 {
		b.WriteString(strconv.FormatInt(d, 10) + "D")
	}
	var t strings.Builder
	if h > 0 {
		t.WriteString(strconv.FormatInt(h, 10) + "H")
	}
	if mi > 0 {
		t.WriteString(strconv.FormatInt(mi, 10) + "M")
	}
	if s > 0 || f > 0 {
		t.WriteString(strconv.FormatInt(s, 10))
		if f > 0 {
			t.WriteString("." + strings.TrimRight(strconv.FormatInt(1000+f, 10)[1:], "0"))
		}
		t.WriteString("S")
	}
	if t.Len() > 0 {
		b.WriteString("T" + t.String())
	}
	if b.Len() == 1 {
		return "PT0S", nil
	}
	return b.String(), nil
}
