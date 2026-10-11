// SPDX-License-Identifier: Apache-2.0

// Package isoweek converts between calendar dates and ISO 8601 week dates
// (weeks start on Monday; week 1 contains the year's first Thursday) in the
// proleptic Gregorian calendar, years 1..9999, using plain day arithmetic.
package isoweek

import (
	"errors"
	"fmt"
)

// ErrInvalid is returned for invalid dates, out-of-range weeks and malformed week strings.
var ErrInvalid = errors.New("isoweek: invalid date")

func isLeap(y int) bool { return y%4 == 0 && (y%100 != 0 || y%400 == 0) }

func daysInMonth(y, m int) int {
	switch m {
	case 2:
		if isLeap(y) {
			return 29
		}
		return 28
	case 4, 6, 9, 11:
		return 30
	}
	return 31
}

// dayNumber counts days from 0001-01-01 (day 0, a Monday).
func dayNumber(y, m, d int) int {
	y1 := y - 1
	n := y1*365 + y1/4 - y1/100 + y1/400
	for k := 1; k < m; k++ {
		n += daysInMonth(y, k)
	}
	return n + d - 1
}

func fromDayNumber(n int) (int, int, int) {
	y := n/366 + 1
	for dayNumber(y+1, 1, 1) <= n {
		y++
	}
	n -= dayNumber(y, 1, 1)
	m := 1
	for n >= daysInMonth(y, m) {
		n -= daysInMonth(y, m)
		m++
	}
	return y, m, n + 1
}

func validDate(y, m, d int) bool {
	return y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

// isoOf computes the ISO week of an already validated date.
func isoOf(y, m, d int) (int, int, int) {
	n := dayNumber(y, m, d)
	wd := n%7 + 1
	thursday := n + 4 - wd
	ty, _, _ := fromDayNumber(thursday)
	return ty, (thursday-dayNumber(ty, 1, 1))/7 + 1, wd
}

// ISOWeek returns the ISO week-numbering year, week (1..53) and weekday (1=Monday..7=Sunday) of a date.
func ISOWeek(y, m, d int) (int, int, int, error) {
	if !validDate(y, m, d) {
		return 0, 0, 0, ErrInvalid
	}
	wy, w, wd := isoOf(y, m, d)
	return wy, w, wd, nil
}

// WeeksInYear returns 52 or 53, the number of ISO weeks in week-numbering year y.
func WeeksInYear(y int) (int, error) {
	if y < 1 || y > 9999 {
		return 0, ErrInvalid
	}
	_, w, _ := isoOf(y, 12, 28)
	return w, nil
}

// FromISOWeek returns the calendar date of an ISO week date.
func FromISOWeek(wy, w, wd int) (int, int, int, error) {
	if wy < 1 || wy > 9999 || wd < 1 || wd > 7 {
		return 0, 0, 0, ErrInvalid
	}
	if weeks, _ := WeeksInYear(wy); w < 1 || w > weeks {
		return 0, 0, 0, ErrInvalid
	}
	jan4 := dayNumber(wy, 1, 4)
	n := jan4 - jan4%7 + (w-1)*7 + wd - 1
	y, m, d := fromDayNumber(n)
	if y < 1 || y > 9999 {
		return 0, 0, 0, ErrInvalid
	}
	return y, m, d, nil
}

// Format renders a date as "YYYY-Www-D".
func Format(y, m, d int) (string, error) {
	wy, w, wd, err := ISOWeek(y, m, d)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%04d-W%02d-%d", wy, w, wd), nil
}

func digits(s string) (int, bool) {
	n := 0
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
		n = n*10 + int(s[i]-'0')
	}
	return n, true
}

// Parse reads "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) and returns the calendar date.
func Parse(s string) (int, int, int, error) {
	if len(s) < 7 {
		return 0, 0, 0, ErrInvalid
	}
	wy, ok := digits(s[:4])
	rest := s[4:]
	if !ok {
		return 0, 0, 0, ErrInvalid
	}
	if rest[0] == '-' {
		rest = rest[1:]
	}
	if len(rest) < 3 || rest[0] != 'W' {
		return 0, 0, 0, ErrInvalid
	}
	w, ok := digits(rest[1:3])
	if !ok {
		return 0, 0, 0, ErrInvalid
	}
	rest = rest[3:]
	wd := 1
	if rest != "" {
		if rest[0] == '-' {
			rest = rest[1:]
		}
		if len(rest) != 1 || rest[0] < '1' || rest[0] > '7' {
			return 0, 0, 0, ErrInvalid
		}
		wd = int(rest[0] - '0')
	}
	return FromISOWeek(wy, w, wd)
}
