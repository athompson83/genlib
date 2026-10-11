// SPDX-License-Identifier: Apache-2.0

// Package bizdays does business-day arithmetic over strict ISO dates
// (YYYY-MM-DD, years 0001-9999, proleptic Gregorian) with configurable
// weekend days (MO..SU, not all seven) and holidays.
package bizdays

import (
	"errors"
	"fmt"
)

// DefaultWeekend is Saturday and Sunday.
var DefaultWeekend = []string{"SA", "SU"}

// MaxN bounds |n| in AddBusinessDays.
const MaxN = 100000

var weekdays = []string{"MO", "TU", "WE", "TH", "FR", "SA", "SU"}

var (
	minDay = daysFromCivil(1, 1, 1)
	maxDay = daysFromCivil(9999, 12, 31)
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

func civilFromDays(z int64) (y, m, d int64) {
	z += 719468
	era := z / 146097
	if z < 0 && z%146097 != 0 {
		era--
	}
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

func weekday(day int64) int { return int(((day+3)%7 + 7) % 7) } // 0 = Monday

func parse(s string) (int64, error) {
	bad := errors.New("bizdays: date must be a valid YYYY-MM-DD")
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return 0, bad
	}
	num := func(t string) (int64, bool) {
		var n int64
		for i := 0; i < len(t); i++ {
			if t[i] < '0' || t[i] > '9' {
				return 0, false
			}
			n = n*10 + int64(t[i]-'0')
		}
		return n, true
	}
	y, ok1 := num(s[:4])
	m, ok2 := num(s[5:7])
	d, ok3 := num(s[8:])
	if !ok1 || !ok2 || !ok3 || y < 1 || m < 1 || m > 12 || d < 1 {
		return 0, bad
	}
	day := daysFromCivil(y, m, d)
	if _, _, dd := civilFromDays(day); dd != d {
		return 0, bad
	}
	return day, nil
}

func format(day int64) (string, error) {
	if day < minDay || day > maxDay {
		return "", errors.New("bizdays: date out of range")
	}
	y, m, d := civilFromDays(day)
	return fmt.Sprintf("%04d-%02d-%02d", y, m, d), nil
}

type cfg struct {
	holidays map[int64]bool
	weekend  [7]bool
	nWeekend int
}

func config(holidays, weekend []string) (cfg, error) {
	c := cfg{holidays: map[int64]bool{}}
	for _, w := range weekend {
		i := -1
		for k, name := range weekdays {
			if name == w {
				i = k
			}
		}
		if i < 0 {
			return c, errors.New("bizdays: weekend days are MO..SU")
		}
		if !c.weekend[i] {
			c.weekend[i] = true
			c.nWeekend++
		}
	}
	if c.nWeekend == 7 {
		return c, errors.New("bizdays: weekend cannot be every day")
	}
	for _, h := range holidays {
		d, err := parse(h)
		if err != nil {
			return c, err
		}
		c.holidays[d] = true
	}
	return c, nil
}

func (c cfg) ok(day int64) bool { return !c.weekend[weekday(day)] && !c.holidays[day] }

// IsBusinessDay reports whether date is neither a weekend day nor a holiday (pass DefaultWeekend for Saturday/Sunday).
func IsBusinessDay(date string, holidays, weekend []string) (bool, error) {
	c, err := config(holidays, weekend)
	if err != nil {
		return false, err
	}
	d, err := parse(date)
	if err != nil {
		return false, err
	}
	return c.ok(d), nil
}

// AddBusinessDays returns the date n business days after date (before it when n < 0); n == 0 returns date when it is a business day, else the next one.
func AddBusinessDays(date string, n int, holidays, weekend []string) (string, error) {
	if n > MaxN || n < -MaxN {
		return "", errors.New("bizdays: n must be within ±100000")
	}
	c, err := config(holidays, weekend)
	if err != nil {
		return "", err
	}
	d, err := parse(date)
	if err != nil {
		return "", err
	}
	if n == 0 {
		for !c.ok(d) {
			d++
			if d > maxDay {
				return "", errors.New("bizdays: date out of range")
			}
		}
		return format(d)
	}
	step, left := int64(1), n
	if n < 0 {
		step, left = -1, -n
	}
	for left > 0 {
		d += step
		if d < minDay || d > maxDay {
			return "", errors.New("bizdays: date out of range")
		}
		if c.ok(d) {
			left--
		}
	}
	return format(d)
}

// BusinessDaysBetween counts business days in [start, end); the result is negative when end is before start.
func BusinessDaysBetween(start, end string, holidays, weekend []string) (int64, error) {
	c, err := config(holidays, weekend)
	if err != nil {
		return 0, err
	}
	a, err := parse(start)
	if err != nil {
		return 0, err
	}
	b, err := parse(end)
	if err != nil {
		return 0, err
	}
	sign := int64(1)
	if b < a {
		a, b, sign = b, a, -1
	}
	days := b - a
	full, rem := days/7, days%7
	count := full * int64(7-c.nWeekend)
	for i := int64(0); i < rem; i++ {
		if !c.weekend[weekday(a+full*7+i)] {
			count++
		}
	}
	for h := range c.holidays {
		if a <= h && h < b && !c.weekend[weekday(h)] {
			count--
		}
	}
	return sign * count, nil
}
