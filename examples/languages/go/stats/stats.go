// SPDX-License-Identifier: Apache-2.0

// Package stats computes descriptive statistics on a non-empty slice of
// finite numbers: a summary (sample variance with n-1, two-pass mean and
// variance), type-7 percentiles (linear interpolation between closest ranks,
// the numpy and R default) and a histogram over increasing bucket edges.
package stats

import (
	"errors"
	"math"
	"sort"
)

// ErrStats is returned for empty input, NaN or infinite values, an out-of-range
// percentile or invalid histogram edges.
var ErrStats = errors.New("stats: invalid input")

// Stats is the result of Summary.
type Stats struct {
	Count                                         int
	Sum, Min, Max, Mean, Median, Variance, Stddev float64
	P25, P75, P90, P95, P99                       float64
}

// HistogramResult counts values per bucket plus those below and above the edges.
type HistogramResult struct {
	Counts       []int
	Below, Above int
}

func check(xs []float64) error {
	if len(xs) == 0 {
		return ErrStats
	}
	for _, x := range xs {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return ErrStats
		}
	}
	return nil
}

func sortedPercentile(s []float64, q float64) float64 {
	h := float64(len(s)-1) * q / 100
	lo := int(math.Floor(h))
	if lo+1 >= len(s) {
		return s[len(s)-1]
	}
	return s[lo] + (h-float64(lo))*(s[lo+1]-s[lo])
}

// Percentile returns the q-th percentile (0..100) by linear interpolation.
func Percentile(xs []float64, q float64) (float64, error) {
	if err := check(xs); err != nil {
		return 0, err
	}
	if !(q >= 0 && q <= 100) {
		return 0, ErrStats
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	return sortedPercentile(s, q), nil
}

// Summary returns count, sum, min, max, mean, median, sample variance,
// standard deviation and the 25th/75th/90th/95th/99th percentiles.
func Summary(xs []float64) (Stats, error) {
	if err := check(xs); err != nil {
		return Stats{}, err
	}
	n := len(xs)
	sum := 0.0
	for _, x := range xs {
		sum += x
	}
	mean := sum / float64(n)
	variance := 0.0
	if n > 1 {
		ss := 0.0
		for _, x := range xs {
			ss += (x - mean) * (x - mean)
		}
		variance = ss / float64(n-1)
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	return Stats{
		Count: n, Sum: sum, Min: s[0], Max: s[n-1], Mean: mean,
		Median: sortedPercentile(s, 50), Variance: variance, Stddev: math.Sqrt(variance),
		P25: sortedPercentile(s, 25), P75: sortedPercentile(s, 75), P90: sortedPercentile(s, 90),
		P95: sortedPercentile(s, 95), P99: sortedPercentile(s, 99),
	}, nil
}

// Histogram buckets xs by strictly increasing edges: bucket i holds
// edges[i] <= x < edges[i+1], and the last bucket also holds x == edges[last].
func Histogram(xs []float64, edges []float64) (HistogramResult, error) {
	if err := check(xs); err != nil {
		return HistogramResult{}, err
	}
	if len(edges) < 2 {
		return HistogramResult{}, ErrStats
	}
	for i, e := range edges {
		if math.IsNaN(e) || math.IsInf(e, 0) || (i > 0 && !(e > edges[i-1])) {
			return HistogramResult{}, ErrStats
		}
	}
	h := HistogramResult{Counts: make([]int, len(edges)-1)}
	last := edges[len(edges)-1]
	for _, x := range xs {
		switch {
		case x < edges[0]:
			h.Below++
		case x > last:
			h.Above++
		case x == last:
			h.Counts[len(h.Counts)-1]++
		default:
			lo, hi := 0, len(edges)-1
			for hi-lo > 1 {
				mid := (lo + hi) / 2
				if edges[mid] <= x {
					lo = mid
				} else {
					hi = mid
				}
			}
			h.Counts[lo]++
		}
	}
	return h, nil
}
