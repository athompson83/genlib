// SPDX-License-Identifier: Apache-2.0

// Package intervals operates on half-open integer intervals [start, end).
// Every interval must have start < end. Results are sorted, non-overlapping
// and have adjacent intervals merged; touching intervals do not overlap.
package intervals

import (
	"errors"
	"sort"
)

// ErrInterval is returned for an interval with start >= end or bad bounds.
var ErrInterval = errors.New("intervals: start must be less than end")

// Interval is the half-open range [I[0], I[1]).
type Interval [2]int64

func validate(xs []Interval) error {
	for _, x := range xs {
		if x[0] >= x[1] {
			return ErrInterval
		}
	}
	return nil
}

// Merge sorts xs and joins overlapping or adjacent intervals.
func Merge(xs []Interval) ([]Interval, error) {
	if err := validate(xs); err != nil {
		return nil, err
	}
	s := append([]Interval(nil), xs...)
	sort.Slice(s, func(i, j int) bool {
		if s[i][0] != s[j][0] {
			return s[i][0] < s[j][0]
		}
		return s[i][1] < s[j][1]
	})
	out := []Interval{}
	for _, x := range s {
		if n := len(out); n > 0 && x[0] <= out[n-1][1] {
			if x[1] > out[n-1][1] {
				out[n-1][1] = x[1]
			}
		} else {
			out = append(out, x)
		}
	}
	return out, nil
}

// Intersect returns the ranges covered by both a and b.
func Intersect(a, b []Interval) ([]Interval, error) {
	a, err := Merge(a)
	if err != nil {
		return nil, err
	}
	if b, err = Merge(b); err != nil {
		return nil, err
	}
	out := []Interval{}
	for i, j := 0, 0; i < len(a) && j < len(b); {
		s, e := a[i][0], a[i][1]
		if b[j][0] > s {
			s = b[j][0]
		}
		if b[j][1] < e {
			e = b[j][1]
		}
		if s < e {
			out = append(out, Interval{s, e})
		}
		if a[i][1] < b[j][1] {
			i++
		} else {
			j++
		}
	}
	return Merge(out)
}

// Subtract returns the ranges of a not covered by b.
func Subtract(a, b []Interval) ([]Interval, error) {
	a, err := Merge(a)
	if err != nil {
		return nil, err
	}
	if b, err = Merge(b); err != nil {
		return nil, err
	}
	out := []Interval{}
	for _, x := range a {
		cur, e := x[0], x[1]
		for _, y := range b {
			if y[1] <= cur || y[0] >= e {
				continue
			}
			if y[0] > cur {
				out = append(out, Interval{cur, y[0]})
			}
			if y[1] > cur {
				cur = y[1]
			}
			if cur >= e {
				break
			}
		}
		if cur < e {
			out = append(out, Interval{cur, e})
		}
	}
	return out, nil
}

// Gaps returns the parts of [lo, hi) that xs does not cover; lo must be < hi.
func Gaps(xs []Interval, lo, hi int64) ([]Interval, error) {
	if lo >= hi {
		return nil, ErrInterval
	}
	return Subtract([]Interval{{lo, hi}}, xs)
}

// Total returns the covered length after merging.
func Total(xs []Interval) (int64, error) {
	m, err := Merge(xs)
	if err != nil {
		return 0, err
	}
	var t int64
	for _, x := range m {
		t += x[1] - x[0]
	}
	return t, nil
}

// Overlaps reports whether x and y share any point (touching is not overlapping).
func Overlaps(x, y Interval) (bool, error) {
	if err := validate([]Interval{x, y}); err != nil {
		return false, err
	}
	return x[0] < y[1] && y[0] < x[1], nil
}

// Contains reports whether p lies in any interval of xs.
func Contains(xs []Interval, p int64) (bool, error) {
	if err := validate(xs); err != nil {
		return false, err
	}
	for _, x := range xs {
		if x[0] <= p && p < x[1] {
			return true, nil
		}
	}
	return false, nil
}
