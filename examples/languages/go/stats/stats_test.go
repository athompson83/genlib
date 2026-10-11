// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package stats

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

func near(a, b float64) bool {
	if a == b {
		return true
	}
	return math.Abs(a-b) <= 1e-9*math.Max(math.Abs(a), math.Abs(b))
}

func TestSummary(t *testing.T) {
	for _, c := range []struct {
		xs   []float64
		want Stats
	}{
		{[]float64{1.0}, Stats{Count: 1, Sum: 1.0, Min: 1.0, Max: 1.0, Mean: 1.0, Median: 1.0, Variance: 0.0, Stddev: 0.0, P25: 1.0, P75: 1.0, P90: 1.0, P95: 1.0, P99: 1.0}},
		{[]float64{1.0, 2.0}, Stats{Count: 2, Sum: 3.0, Min: 1.0, Max: 2.0, Mean: 1.5, Median: 1.5, Variance: 0.5, Stddev: 0.7071067811865476, P25: 1.25, P75: 1.75, P90: 1.9, P95: 1.95, P99: 1.99}},
		{[]float64{3.0, 1.0, 2.0}, Stats{Count: 3, Sum: 6.0, Min: 1.0, Max: 3.0, Mean: 2.0, Median: 2.0, Variance: 1.0, Stddev: 1.0, P25: 1.5, P75: 2.5, P90: 2.8, P95: 2.9, P99: 2.98}},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, Stats{Count: 8, Sum: 40.0, Min: 2.0, Max: 9.0, Mean: 5.0, Median: 4.5, Variance: 4.571428571428571, Stddev: 2.138089935299395, P25: 4.0, P75: 5.5, P90: 7.6, P95: 8.3, P99: 8.86}},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, Stats{Count: 5, Sum: 10.75, Min: -3.25, Max: 10.0, Mean: 2.15, Median: 1.5, Variance: 23.9875, Stddev: 4.897703543498729, P25: 0.0, P75: 2.5, P90: 7.000000000000001, P95: 8.499999999999998, P99: 9.7}},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, Stats{Count: 10, Sum: 550.0, Min: 10.0, Max: 100.0, Mean: 55.0, Median: 55.0, Variance: 916.6666666666666, Stddev: 30.276503540974915, P25: 32.5, P75: 77.5, P90: 91.0, P95: 95.5, P99: 99.1}},
		{[]float64{1000000004.0, 1000000007.0, 1000000013.0, 1000000016.0}, Stats{Count: 4, Sum: 4000000040.0, Min: 1000000004.0, Max: 1000000016.0, Mean: 1000000010.0, Median: 1000000010.0, Variance: 30.0, Stddev: 5.477225575051661, P25: 1000000006.25, P75: 1000000013.75, P90: 1000000015.1, P95: 1000000015.55, P99: 1000000015.91}},
	} {
		got, err := Summary(c.xs)
		if err != nil || got.Count != c.want.Count {
			t.Fatalf("Summary(%v) = %+v, %v", c.xs, got, err)
		}
		g := []float64{got.Sum, got.Min, got.Max, got.Mean, got.Median, got.Variance, got.Stddev, got.P25, got.P75, got.P90, got.P95, got.P99}
		w := []float64{c.want.Sum, c.want.Min, c.want.Max, c.want.Mean, c.want.Median, c.want.Variance, c.want.Stddev, c.want.P25, c.want.P75, c.want.P90, c.want.P95, c.want.P99}
		for i := range g {
			if !near(g[i], w[i]) {
				t.Errorf("Summary(%v) field %d = %v; want %v", c.xs, i, g[i], w[i])
			}
		}
	}
	for _, xs := range [][]float64{[]float64{}, {1, math.NaN()}, {math.Inf(1)}} {
		if _, err := Summary(xs); !errors.Is(err, ErrStats) {
			t.Errorf("Summary(%v) should fail", xs)
		}
	}
}

func TestPercentile(t *testing.T) {
	for _, c := range []struct {
		xs      []float64
		q, want float64
	}{
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 0.0, 2.0},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 10.0, 3.4},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 33.3, 4.0},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 50.0, 4.5},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 99.9, 8.986},
		{[]float64{2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 100.0, 9.0},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 0.0, -3.25},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 10.0, -1.95},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 33.3, 0.4979999999999998},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 50.0, 1.5},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 99.9, 9.970000000000002},
		{[]float64{1.5, 2.5, -3.25, 10.0, 0.0}, 100.0, 10.0},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 0.0, 10.0},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 10.0, 19.0},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 33.3, 39.97},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 50.0, 55.0},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 99.9, 99.91},
		{[]float64{10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 100.0, 100.0},
	} {
		if got, err := Percentile(c.xs, c.q); err != nil || !near(got, c.want) {
			t.Errorf("Percentile(%v, %v) = %v, %v; want %v", c.xs, c.q, got, err, c.want)
		}
	}
	for _, c := range []struct {
		xs []float64
		q  float64
	}{{[]float64{1.0, 2.0}, -1.0}, {[]float64{1.0, 2.0}, 100.5}} {
		if _, err := Percentile(c.xs, c.q); !errors.Is(err, ErrStats) {
			t.Errorf("Percentile(%v, %v) should fail", c.xs, c.q)
		}
	}
}

func TestHistogram(t *testing.T) {
	for _, c := range []struct {
		xs, edges []float64
		want      HistogramResult
	}{
		{[]float64{1.0, 2.0, 2.5, 3.0, 5.0, 9.0, -1.0, 10.0, 11.0}, []float64{0.0, 2.0, 5.0, 10.0}, HistogramResult{[]int{1, 3, 3}, 1, 1}},
		{[]float64{0.5}, []float64{0.0, 1.0}, HistogramResult{[]int{1}, 0, 0}},
	} {
		if got, err := Histogram(c.xs, c.edges); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Histogram(%v, %v) = %+v, %v; want %+v", c.xs, c.edges, got, err, c.want)
		}
	}
	for _, edges := range [][]float64{[]float64{0.0}, []float64{1.0, 1.0}, []float64{2.0, 1.0}} {
		if _, err := Histogram([]float64{1}, edges); !errors.Is(err, ErrStats) {
			t.Errorf("Histogram edges %v should fail", edges)
		}
	}
}
