// SPDX-License-Identifier: Apache-2.0

// Package rrule expands a UTC subset of RFC 5545 recurrence rules: FREQ
// DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, COUNT or UNTIL, BYDAY (ordinals
// only with MONTHLY or YEARLY), BYMONTHDAY and BYMONTH with any frequency.
// It matches python-dateutil for every rule it accepts; it rejects BYSETPOS,
// WKST, BYHOUR and every other part rather than silently ignoring them.
package rrule

import (
	"errors"
	"fmt"
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
	monthScope          bool // YEARLY with an explicit BYMONTH: ordinals count per month
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

// ordinal parses the optional BYDAY prefix [+-]?d{1,2}.
func ordinal(s string) (int, bool) {
	body := s
	if body != "" && (body[0] == '+' || body[0] == '-') {
		body = body[1:]
	}
	if len(body) < 1 || len(body) > 2 {
		return 0, false
	}
	n, ok := digits(body)
	if !ok {
		return 0, false
	}
	if s[0] == '-' {
		return -int(n), true
	}
	return int(n), true
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
	_, hasMonth := parts["BYMONTH"]
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
		plain, ordinals := false, false
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
			if wd < 0 {
				return nil, fail("invalid BYDAY %q", d)
			}
			n := 0
			if prefix := d[:len(d)-2]; prefix != "" {
				var ok bool
				if n, ok = ordinal(prefix); !ok {
					return nil, fail("invalid BYDAY ordinal %q", d)
				}
				lim := 53
				if r.freq == "MONTHLY" || (r.freq == "YEARLY" && hasMonth) {
					lim = 5
				}
				if (r.freq != "MONTHLY" && r.freq != "YEARLY") || n == 0 || n > lim || n < -lim {
					return nil, fail("BYDAY ordinal %q is not allowed with FREQ=%s", d, r.freq)
				}
				ordinals = true
			} else {
				plain = true
			}
			r.byday = append(r.byday, byDay{n, wd})
		}
		if plain && ordinals {
			return nil, errors.New("rrule: BYDAY cannot mix plain and ordinal weekdays")
		}
	}
	if v, ok := parts["BYMONTHDAY"]; ok {
		if r.bymonthday, err = numbers(v, 1, 31, true); err != nil {
			return nil, err
		}
	}
	if v, ok := parts["BYMONTH"]; ok {
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

// matches reports whether day passes every filter of r; r already carries the
// dateutil defaults derived from dtstart.
func (r *rule) matches(day int64) bool {
	y, m, d := civilFromDays(day)
	if len(r.bymonth) > 0 && !containsInt(r.bymonth, int(m)) {
		return false
	}
	nd := monthDays(y, m)
	if len(r.bymonthday) > 0 {
		ok := false
		for _, x := range r.bymonthday {
			want := int64(x)
			if x < 0 {
				want = nd + int64(x) + 1
			}
			if d == want {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	if len(r.byday) == 0 {
		return true
	}
	wd := weekday(day)
	for _, b := range r.byday {
		if b.wd != wd {
			continue
		}
		if b.n == 0 {
			return true
		}
		// Ordinals count within the month (MONTHLY, or YEARLY with BYMONTH)
		// or within the whole year.
		var first, last int64
		if r.freq == "MONTHLY" || r.monthScope {
			first = day - (d - 1)
			last = first + nd - 1
		} else {
			first = daysFromCivil(y, 1, 1)
			last = daysFromCivil(y, 12, 31)
		}
		if (b.n > 0 && (day-first)/7+1 == int64(b.n)) || (b.n < 0 && (last-day)/7+1 == int64(-b.n)) {
			return true
		}
	}
	return false
}

func containsInt(xs []int, v int) bool {
	for _, x := range xs {
		if x == v {
			return true
		}
	}
	return false
}

// period returns the first day and length of period k, or false once the
// period starts after 9999-12-31.
func (r *rule) period(startDay int64, k int64) (int64, int64, bool) {
	sy, sm, _ := civilFromDays(startDay)
	step := k * int64(r.interval)
	var first, n int64
	switch r.freq {
	case "DAILY":
		first, n = startDay+step, 1
	case "WEEKLY":
		first, n = startDay-int64(weekday(startDay))+7*step, 7
	case "MONTHLY":
		mi := sm - 1 + step
		y, mo := sy+mi/12, mi%12+1
		if y > 9999 {
			return 0, 0, false
		}
		first, n = daysFromCivil(y, mo, 1), monthDays(y, mo)
	default: // YEARLY
		y := sy + step
		if y > 9999 {
			return 0, 0, false
		}
		first, n = daysFromCivil(y, 1, 1), daysFromCivil(y+1, 1, 1)-daysFromCivil(y, 1, 1)
	}
	if first > maxDay {
		return 0, 0, false
	}
	if first+n-1 > maxDay {
		n = maxDay - first + 1
	}
	return first, n, true
}

var maxDay = daysFromCivil(9999, 12, 31)

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
	r.monthScope = r.freq == "YEARLY" && len(r.bymonth) > 0
	if len(r.byday) == 0 && len(r.bymonthday) == 0 {
		_, sm, sd := civilFromDays(startDay)
		switch r.freq {
		case "WEEKLY":
			r.byday = []byDay{{0, weekday(startDay)}}
		case "MONTHLY":
			r.bymonthday = []int{int(sd)}
		case "YEARLY":
			r.bymonthday = []int{int(sd)}
			if len(r.bymonth) == 0 {
				r.bymonth = []int{int(sm)}
			}
		}
	}
	out := []string{}
	for k := int64(0); k < MaxPeriods; k++ {
		first, n, ok := r.period(startDay, k)
		if !ok {
			break
		}
		for d := first; d < first+n; d++ {
			if !r.matches(d) {
				continue
			}
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
		if r.hasUntil && first*86400+tod > r.until {
			break
		}
	}
	return out, nil
}
