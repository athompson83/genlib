// SPDX-License-Identifier: Apache-2.0

package geometry

import (
	"math"
	"testing"
)

var (
	square  = []Point{{0, 0}, {4, 0}, {4, 4}, {0, 4}}
	concave = []Point{{0, 0}, {6, 0}, {6, 6}, {3, 3}, {0, 6}}
	line    = []Point{{0, 0}, {1, 0.1}, {2, -0.1}, {3, 5}, {4, 6}, {5, 7}, {6, 8.1}, {7, 9}, {8, 9}, {9, 9}}
)

func TestPointInPolygon(t *testing.T) {
	for _, c := range []struct {
		ring  []Point
		point Point
		want  bool
	}{
		{square, Point{2, 2}, true}, {square, Point{5, 2}, false}, {square, Point{4, 2}, true},
		{square, Point{0, 0}, true}, {square, Point{2, 4.000001}, false},
		{concave, Point{3, 4}, false}, {concave, Point{3, 2}, true}, {concave, Point{1, 5}, true}, {concave, Point{3, 3}, true},
		{append(append([]Point{}, square...), square[0]), Point{2, 2}, true},
	} {
		if got, err := PointInPolygon(c.point, c.ring); err != nil || got != c.want {
			t.Errorf("PointInPolygon(%v) = %v, %v", c.point, got, err)
		}
	}
	if _, err := PointInPolygon(Point{0, 0}, square[:2]); err == nil {
		t.Error("2-point ring accepted")
	}
}

func TestAreaCentroid(t *testing.T) {
	reversed := []Point{{0, 4}, {4, 4}, {4, 0}, {0, 0}}
	for _, c := range []struct {
		ring []Point
		want float64
	}{{square, 16}, {reversed, -16}, {concave, 27}} {
		if got, err := SignedArea(c.ring); err != nil || got != c.want {
			t.Errorf("SignedArea = %v, %v want %v", got, err, c.want)
		}
	}
	for _, c := range []struct {
		ring []Point
		want Point
	}{{square, Point{2, 2}}, {concave, Point{3, 2.3333333333333335}}} {
		got, err := Centroid(c.ring)
		if err != nil || math.Abs(got[0]-c.want[0]) > 1e-9 || math.Abs(got[1]-c.want[1]) > 1e-9 {
			t.Errorf("Centroid = %v, %v want %v", got, err, c.want)
		}
	}
	if _, err := Centroid([]Point{{0, 0}, {1, 1}, {2, 2}}); err == nil {
		t.Error("zero-area centroid accepted")
	}
}

func TestSimplify(t *testing.T) {
	for _, c := range []struct {
		pts  []Point
		tol  float64
		want []Point
	}{
		{line, 1, []Point{{0, 0}, {2, -0.1}, {3, 5}, {7, 9}, {9, 9}}},
		{line, 0.05, []Point{{0, 0}, {1, 0.1}, {2, -0.1}, {3, 5}, {6, 8.1}, {7, 9}, {9, 9}}},
		{[]Point{{0, 0}, {5, 5}}, 1, []Point{{0, 0}, {5, 5}}},
	} {
		got, err := Simplify(c.pts, c.tol)
		if err != nil || len(got) != len(c.want) {
			t.Fatalf("Simplify(tol %v) = %v, %v", c.tol, got, err)
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Fatalf("Simplify(tol %v) = %v want %v", c.tol, got, c.want)
			}
		}
	}
	if _, err := Simplify(line, -1); err == nil {
		t.Error("negative tolerance accepted")
	}
}

func TestRingArea(t *testing.T) {
	for _, c := range []struct {
		ring []Point
		want float64
	}{
		{[]Point{{0, 0}, {1, 0}, {1, 1}, {0, 1}}, 12391399902.070992},
		{[]Point{{-0.13, 51.5}, {-0.12, 51.5}, {-0.12, 51.51}, {-0.13, 51.51}}, 771337.3090775362},
	} {
		got, err := RingAreaSquareMeters(c.ring)
		if err != nil || math.Abs(got-c.want)/c.want > 1e-9 {
			t.Errorf("RingAreaSquareMeters = %v, %v want %v", got, err, c.want)
		}
	}
}
