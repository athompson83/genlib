// SPDX-License-Identifier: Apache-2.0

// Package cronnext finds the next run time of a standard five-field cron
// expression, evaluated in UTC. Fields: minute hour day-of-month month
// day-of-week (0 and 7 are Sunday); each is a comma list of "*", "N" or "A-B"
// with an optional "/step" ("N/step" runs from N to the maximum). Names,
// seconds and the "?", "L" and "W" extensions are not supported. As in Vixie
// cron, when both day fields are restricted a day matches if either matches.
package cronnext

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// SearchYears bounds the search before NextRun gives up.
const SearchYears = 5

var (
	itemRe = regexp.MustCompile(`^(\*|[0-9]{1,2}(?:-[0-9]{1,2})?)(?:/([0-9]{1,2}))?$`)
	isoRe  = regexp.MustCompile(`^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.[0-9]+)?)?Z$`)
	fields = []struct {
		name      string
		low, high int
	}{{"minute", 0, 59}, {"hour", 0, 23}, {"day-of-month", 1, 31}, {"month", 1, 12}, {"day-of-week", 0, 7}}
)

// Schedule is a parsed expression; each set is indexed by value.
type Schedule struct {
	Minutes, Hours, Doms, Months, Dows [64]bool
	DomRestricted, DowRestricted       bool
}

func parseField(text, name string, low, high int, set *[64]bool) error {
	for _, item := range strings.Split(text, ",") {
		m := itemRe.FindStringSubmatch(item)
		if m == nil {
			return fmt.Errorf("cronnext: invalid %s field %q", name, text)
		}
		step := 1
		if m[2] != "" {
			step, _ = strconv.Atoi(m[2])
			if step < 1 {
				return fmt.Errorf("cronnext: %s step must be >= 1", name)
			}
		}
		var start, end int
		switch {
		case m[1] == "*":
			start, end = low, high
		case strings.Contains(m[1], "-"):
			a, b, _ := strings.Cut(m[1], "-")
			start, _ = strconv.Atoi(a)
			end, _ = strconv.Atoi(b)
		default:
			start, _ = strconv.Atoi(m[1])
			end = start
			if m[2] != "" {
				end = high
			}
		}
		if start < low || start > high || end < low || end > high || start > end {
			return fmt.Errorf("cronnext: %s value out of range %d-%d: %q", name, low, high, item)
		}
		for v := start; v <= end; v += step {
			set[v] = true
		}
	}
	return nil
}

// Parse validates a five-field expression.
func Parse(expression string) (Schedule, error) {
	parts := strings.Fields(expression)
	if len(parts) != 5 {
		return Schedule{}, errors.New("cronnext: expression must have exactly 5 fields")
	}
	var s Schedule
	sets := []*[64]bool{&s.Minutes, &s.Hours, &s.Doms, &s.Months, &s.Dows}
	for i, f := range fields {
		if err := parseField(parts[i], f.name, f.low, f.high, sets[i]); err != nil {
			return Schedule{}, err
		}
	}
	if s.Dows[7] {
		s.Dows[0] = true
	}
	s.DomRestricted, s.DowRestricted = !strings.HasPrefix(parts[2], "*"), !strings.HasPrefix(parts[4], "*")
	return s, nil
}

func parseAfter(text string) (time.Time, error) {
	m := isoRe.FindStringSubmatch(text)
	if m == nil {
		return time.Time{}, errors.New("cronnext: after must be an ISO 8601 UTC time like 2026-10-10T12:00:00Z")
	}
	n := make([]int, 6)
	for i := range n {
		n[i], _ = strconv.Atoi(m[i+1])
	}
	t := time.Date(n[0], time.Month(n[1]), n[2], n[3], n[4], 0, 0, time.UTC)
	if t.Year() != n[0] || int(t.Month()) != n[1] || t.Day() != n[2] || t.Hour() != n[3] || t.Minute() != n[4] || n[5] > 59 {
		return time.Time{}, errors.New("cronnext: after is not a valid date and time")
	}
	return t, nil
}

// NextRun returns the first matching minute strictly after afterISOUTC,
// formatted YYYY-MM-DDTHH:MM:00Z.
func NextRun(expression, afterISOUTC string) (string, error) {
	s, err := Parse(expression)
	if err != nil {
		return "", err
	}
	start, err := parseAfter(afterISOUTC)
	if err != nil {
		return "", err
	}
	limit := start.AddDate(SearchYears, 0, 0)
	for t := start.Add(time.Minute); !t.After(limit); {
		if !s.Months[t.Month()] {
			t = time.Date(t.Year(), t.Month()+1, 1, 0, 0, 0, 0, time.UTC)
			continue
		}
		domOK, dowOK := s.Doms[t.Day()], s.Dows[t.Weekday()]
		dayOK := domOK && dowOK
		if s.DomRestricted && s.DowRestricted {
			dayOK = domOK || dowOK
		}
		if !dayOK {
			t = time.Date(t.Year(), t.Month(), t.Day()+1, 0, 0, 0, 0, time.UTC)
			continue
		}
		if !s.Hours[t.Hour()] {
			t = time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, time.UTC)
			continue
		}
		if !s.Minutes[t.Minute()] {
			t = t.Add(time.Minute)
			continue
		}
		return t.Format("2006-01-02T15:04:00Z"), nil
	}
	return "", fmt.Errorf("cronnext: no run within %d years", SearchYears)
}
