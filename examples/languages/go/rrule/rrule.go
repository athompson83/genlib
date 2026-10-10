// SPDX-License-Identifier: Apache-2.0

// Package rrule expands a UTC subset of RFC 5545 recurrence rules: FREQ
// DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT or UNTIL, BYDAY (weekly
// weekdays; monthly with optional ordinals), BYMONTHDAY (monthly) and BYMONTH
// (yearly). Unsupported parts are errors rather than silently ignored.
package rrule

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

const (
	// DefaultLimit is the conventional occurrence limit.
	DefaultLimit = 50
	// MaxLimit is the largest accepted limit.
	MaxLimit = 1000
	// MaxPeriods bounds the scan of days, weeks, months or years.
	MaxPeriods = 100000
)

var weekdays = []string{"MO", "TU", "WE", "TH", "FR", "SA", "SU"}

type byDay struct{ n, wd int }

type rule struct {
	freq                string
	interval, count     int
	until               int64
	hasUntil            bool
	byday               []byDay
	bymonthday, bymonth []int
}

func fail(format string, a ...interface{}) error {
	return fmt.Errorf("rrule: "+format, a...)
}

func daysFromCivil(y, m, d int64) int64 {
	if m <= 2 {
		y--
	}
	era := y / 400 // y >= 0 for supported years
	yoe := y - era*400
	doy := (153*((m+9)%12)+2)/5 + d - 1
	return era*146097 + yoe*365 + yoe/4 - yoe/100 + doy - 719468
}

func civilFromDays(z int64) (y, m, d int64) {
	z += 719468
	era := z / 146097
	doe := z - era*146097
	yoe := (doe - doe/1460 + doe/36524 - doe/146096) / 365
	doy := doe - (365*yoe + yoe/4 - yoe/100)
	mp := (5*doy + 2) / 153
	d = doy - (153*mp+2)/5 + 1
	m = mp + 3
	if m > 12 {
		m -= 12
	}
	y = yoe + era*400
	if m <= 2 {
		y++
	}
	return
}

// weekday returns 0 for Monday .. 6 for Sunday (day 0 = 1970-01-01, Thursday).
func weekday(day int64) int { return int((day%7 + 7 + 3) % 7) }

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

func digits(s string) (int64, bool) {
	if s == "" {
		return 0, false
	}
	var n int64
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
		n = n*10 + int64(s[i]-'0')
	}
	return n, true
}

// stamp validates y, mo, d, h, mi, s digit fields and returns unix seconds.
func stamp(f [6]string) (int64, bool) {
	var v [6]int64
	for i, s := range f {
		n, ok := digits(s)
		if !ok {
			return 0, false
		}
		v[i] = n
	}
	if v[0] < 1 || v[1] < 1 || v[1] > 12 || v[2] < 1 || v[2] > monthDays(v[0], v[1]) || v[3] > 23 || v[4] > 59 || v[5] > 59 {
		return 0, false
	}
	return daysFromCivil(v[0], v[1], v[2])*86400 + v[3]*3600 + v[4]*60 + v[5], true
}

func parseStart(s string) (int64, bool) {
	if len(s) != 20 || s[4] != '-' || s[7] != '-' || s[10] != 'T' || s[13] != ':' || s[16] != ':' || s[19] != 'Z' {
		return 0, false
	}
	return stamp([6]string{s[0:4], s[5:7], s[8:10], s[11:13], s[14:16], s[17:19]})
}

func parseUntil(s string) (int64, bool) {
	if len(s) != 16 || s[8] != 'T' || s[15] != 'Z' {
		return 0, false
	}
	return stamp([6]string{s[0:4], s[4:6], s[6:8], s[9:11], s[11:13], s[13:15]})
}

// number parses [+-]?d{1,4} with lo <= |n| <= hi; signed allows negatives.
func number(s string, lo, hi int, signed bool) (int, error) {
	body := strings.TrimLeft(s, "+-")
	if len(s)-len(body) > 1 || (!signed && strings.HasPrefix(s, "-")) || len(body) > 4 {
		return 0, fail("invalid number %q", s)
	}
	n, ok := digits(body)
	if !ok || int(n) < lo || int(n) > hi {
		return 0, fail("number %q out of range", s)
	}
	if strings.HasPrefix(s, "-") {
		return -int(n), nil
	}
	return int(n), nil
}

func numbers(s string, lo, hi int, signed bool) ([]int, error) {
	var out []int
	for _, x := range strings.Split(s, ",") {
		n, err := number(x, lo, hi, signed)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}

func parseRule(text string) (*rule, error) {
	parts := map[string]string{}
	for _, p := range strings.Split(text, ";") {
		k, v, ok := strings.Cut(p, "=")
		if !ok {
			return nil, fail("malformed part %q", p)
		}
		if _, dup := parts[k]; dup {
			return nil, fail("duplicate part %s", k)
		}
		parts[k] = v
	}
	for k := range parts {
		switch k {
		case "FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH":
		default:
			return nil, fail("unsupported part %s", k)
		}
	}
	r := &rule{freq: parts["FREQ"], interval: 1}
	switch r.freq {
	case "DAILY", "WEEKLY", "MONTHLY", "YEARLY":
	default:
		return nil, errors.New("rrule: FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY")
	}
	_, hasCount := parts["COUNT"]
	if _, hasUntil := parts["UNTIL"]; hasCount && hasUntil {
		return nil, errors.New("rrule: COUNT and UNTIL are mutually exclusive")
	}
	var err error
	if v, ok := parts["INTERVAL"]; ok {
		if r.interval, err = number(v, 1, 9999, false); err != nil {
			return nil, err
		}
	}
	if v, ok := parts["COUNT"]; ok {
		if r.count, err = number(v, 1, 9999, false); err != nil {
			return nil, err
		}
	}
	if v, ok := parts["UNTIL"]; ok {
		if r.until, r.hasUntil = parseUntil(v); !r.hasUntil {
			return nil, errors.New("rrule: UNTIL must be YYYYMMDDTHHMMSSZ")
		}
	}
	if v, ok := parts["BYDAY"]; ok {
		if r.freq == "DAILY" || r.freq == "YEARLY" {
			return nil, errors.New("rrule: BYDAY needs FREQ=WEEKLY or MONTHLY")
		}
		for _, d := range strings.Split(v, ",") {
			if len(d) < 2 {
				return nil, fail("invalid BYDAY %q", d)
			}
			wd := -1
			for i, w := range weekdays {
				if d[len(d)-2:] == w {
					wd = i
				}
			}
			n := 0
			if prefix := d[:len(d)-2]; prefix != "" {
				if n, err = number(prefix, 1, 5, true); err != nil || len(strings.TrimLeft(prefix, "+-")) != 1 {
					return nil, fail("invalid BYDAY ordinal %q", d)
				}
				if r.freq != "MONTHLY" {
					return nil, errors.New("rrule: BYDAY ordinals need FREQ=MONTHLY")
				}
			}
			if wd < 0 {
				return nil, fail("invalid BYDAY %q", d)
			}
			r.byday = append(r.byday, byDay{n, wd})
		}
	}
	if v, ok := parts["BYMONTHDAY"]; ok {
		if r.freq != "MONTHLY" {
			return nil, errors.New("rrule: BYMONTHDAY needs FREQ=MONTHLY")
		}
		if r.byday != nil {
			return nil, errors.New("rrule: BYDAY and BYMONTHDAY cannot be combined")
		}
		if r.bymonthday, err = numbers(v, 1, 31, true); err != nil {
			return nil, err
		}
	}
	if v, ok := parts["BYMONTH"]; ok {
		if r.freq != "YEARLY" {
			return nil, errors.New("rrule: BYMONTH needs FREQ=YEARLY")
		}
		if r.bymonth, err = numbers(v, 1, 12, false); err != nil {
			return nil, err
		}
	}
	return r, nil
}

func format(t int64) string {
	day := t / 86400
	sec := t - day*86400
	y, m, d := civilFromDays(day)
	return fmt.Sprintf("%04d-%02d-%02dT%02d:%02d:%02dZ", y, m, d, sec/3600, sec/60%60, sec%60)
}

// candidates returns the sorted, de-duplicated candidate days of period k, or
// false once the period passes year 9999.
func (r *rule) candidates(startDay int64, k int64) ([]int64, bool) {
	sy, sm, sd := civilFromDays(startDay)
	step := k * int64(r.interval)
	set := map[int64]bool{}
	switch r.freq {
	case "DAILY":
		set[startDay+step] = true
	case "WEEKLY":
		monday := startDay - int64(weekday(startDay)) + 7*step
		if len(r.byday) == 0 {
			set[monday+int64(weekday(startDay))] = true
		}
		for _, b := range r.byday {
			set[monday+int64(b.wd)] = true
		}
	case "MONTHLY":
		mi := sm - 1 + step
		y, mo := sy+mi/12, mi%12+1
		if y > 9999 {
			return nil, false
		}
		nd := monthDays(y, mo)
		first := daysFromCivil(y, mo, 1)
		switch {
		case len(r.byday) > 0:
			for _, b := range r.byday {
				var ds []int64
				for d := int64(0); d < nd; d++ {
					if weekday(first+d) == b.wd {
						ds = append(ds, first+d)
					}
				}
				switch {
				case b.n == 0:
					for _, d := range ds {
						set[d] = true
					}
				case b.n > 0 && b.n <= len(ds):
					set[ds[b.n-1]] = true
				case b.n < 0 && -b.n <= len(ds):
					set[ds[len(ds)+b.n]] = true
				}
			}
		case len(r.bymonthday) > 0:
			for _, md := range r.bymonthday {
				d := int64(md)
				if md < 0 {
					d = nd + int64(md) + 1
				}
				if d >= 1 && d <= nd {
					set[first+d-1] = true
				}
			}
		case sd <= nd:
			set[first+sd-1] = true
		}
	default: // YEARLY
		y := sy + step
		if y > 9999 {
			return nil, false
		}
		months := r.bymonth
		if len(months) == 0 {
			months = []int{int(sm)}
		}
		for _, mo := range months {
			if sd <= monthDays(y, int64(mo)) {
				set[daysFromCivil(y, int64(mo), sd)] = true
			}
		}
	}
	out := make([]int64, 0, len(set))
	for d := range set {
		if y, _, _ := civilFromDays(d); y > 9999 {
			return nil, false
		}
		out = append(out, d)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out, true
}

// Expand returns up to limit (1..1000; use DefaultLimit) occurrences of rule
// starting at dtstart ("YYYY-MM-DDTHH:MM:SSZ"), formatted the same way. All
// occurrences keep dtstart's time; dtstart itself is included only when it
// matches the rule.
func Expand(dtstart, ruleText string, limit int) ([]string, error) {
	if limit < 1 || limit > MaxLimit {
		return nil, errors.New("rrule: limit must be in 1..1000")
	}
	start, ok := parseStart(dtstart)
	if !ok {
		return nil, errors.New("rrule: dtstart must be YYYY-MM-DDTHH:MM:SSZ")
	}
	r, err := parseRule(ruleText)
	if err != nil {
		return nil, err
	}
	startDay, tod := start/86400, start%86400
	out := []string{}
	for k := int64(0); k < MaxPeriods; k++ {
		days, ok := r.candidates(startDay, k)
		if !ok {
			break
		}
		for _, d := range days {
			c := d*86400 + tod
			if c < start {
				continue
			}
			if r.hasUntil && c > r.until {
				return out, nil
			}
			out = append(out, format(c))
			if (r.count > 0 && len(out) >= r.count) || len(out) >= limit {
				return out, nil
			}
		}
		earliest := start
		if len(days) > 0 {
			earliest = days[0]*86400 + tod
		}
		if r.hasUntil && earliest > r.until {
			break
		}
	}
	return out, nil
}
