// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package intervals

import (
	"errors"
	"reflect"
	"testing"
)

func eq(t *testing.T, name string, got []Interval, err error, want []Interval) {
	t.Helper()
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Errorf("%s = %v, %v; want %v", name, got, err, want)
	}
}

func TestIntervals(t *testing.T) {
	var got []Interval
	var err error
	got, err = Merge([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}})
	eq(t, "Merge", got, err, []Interval{{1, 6}, {8, 10}, {15, 20}})
	got, err = Merge([]Interval{{5, 7}, {1, 2}, {2, 3}})
	eq(t, "Merge", got, err, []Interval{{1, 3}, {5, 7}})
	got, err = Merge([]Interval{})
	eq(t, "Merge", got, err, []Interval{})
	got, err = Merge([]Interval{{-5, -1}, {-3, 4}})
	eq(t, "Merge", got, err, []Interval{{-5, 4}})
	got, err = Intersect([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, []Interval{{0, 2}, {5, 9}, {17, 30}})
	eq(t, "Intersect", got, err, []Interval{{1, 2}, {5, 6}, {8, 9}, {17, 20}})
	got, err = Intersect([]Interval{{1, 2}}, []Interval{{2, 3}})
	eq(t, "Intersect", got, err, []Interval{})
	got, err = Intersect([]Interval{{0, 100}}, []Interval{{10, 20}, {30, 40}})
	eq(t, "Intersect", got, err, []Interval{{10, 20}, {30, 40}})
	got, err = Subtract([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, []Interval{{0, 2}, {5, 9}, {17, 30}})
	eq(t, "Subtract", got, err, []Interval{{2, 5}, {9, 10}, {15, 17}})
	got, err = Subtract([]Interval{{0, 10}}, []Interval{{2, 3}, {5, 7}})
	eq(t, "Subtract", got, err, []Interval{{0, 2}, {3, 5}, {7, 10}})
	got, err = Subtract([]Interval{{0, 10}}, []Interval{{0, 10}})
	eq(t, "Subtract", got, err, []Interval{})
	got, err = Subtract([]Interval{{0, 10}}, []Interval{})
	eq(t, "Subtract", got, err, []Interval{{0, 10}})
	got, err = Gaps([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 0, 25)
	eq(t, "Gaps", got, err, []Interval{{0, 1}, {6, 8}, {10, 15}, {20, 25}})
	got, err = Gaps([]Interval{}, 3, 5)
	eq(t, "Gaps", got, err, []Interval{{3, 5}})
	if n, err := Total([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}); err != nil || n != 12 {
		t.Errorf("Total = %d, %v; want 12", n, err)
	}
	if n, err := Total([]Interval{{0, 2}, {5, 9}, {17, 30}}); err != nil || n != 19 {
		t.Errorf("Total = %d, %v; want 19", n, err)
	}
	if ok, err := Overlaps(Interval{1, 3}, Interval{2, 4}); err != nil || ok != true {
		t.Errorf("Overlaps([1, 3], [2, 4]) = %v", ok)
	}
	if ok, err := Overlaps(Interval{1, 3}, Interval{3, 4}); err != nil || ok != false {
		t.Errorf("Overlaps([1, 3], [3, 4]) = %v", ok)
	}
	if ok, err := Overlaps(Interval{5, 9}, Interval{6, 7}); err != nil || ok != true {
		t.Errorf("Overlaps([5, 9], [6, 7]) = %v", ok)
	}
	if ok, err := Overlaps(Interval{1, 2}, Interval{5, 6}); err != nil || ok != false {
		t.Errorf("Overlaps([1, 2], [5, 6]) = %v", ok)
	}
	if ok, err := Contains([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 6); err != nil || ok != false {
		t.Errorf("Contains(6) = %v", ok)
	}
	if ok, err := Contains([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 5); err != nil || ok != true {
		t.Errorf("Contains(5) = %v", ok)
	}
	if ok, err := Contains([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 20); err != nil || ok != false {
		t.Errorf("Contains(20) = %v", ok)
	}
	if ok, err := Contains([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 19); err != nil || ok != true {
		t.Errorf("Contains(19) = %v", ok)
	}
	if ok, err := Contains([]Interval{{1, 3}, {2, 6}, {8, 10}, {15, 18}, {18, 20}}, 0); err != nil || ok != false {
		t.Errorf("Contains(0) = %v", ok)
	}
	for _, bad := range [][]Interval{[]Interval{{3, 3}}, []Interval{{5, 1}}} {
		if _, err := Merge(bad); !errors.Is(err, ErrInterval) {
			t.Errorf("Merge(%v) should fail", bad)
		}
		if _, err := Total(bad); err == nil {
			t.Errorf("Total(%v) should fail", bad)
		}
		if _, err := Overlaps(bad[0], Interval{0, 1}); err == nil {
			t.Errorf("Overlaps(%v) should fail", bad)
		}
	}
	if _, err := Gaps(nil, 5, 5); err == nil {
		t.Error("Gaps with lo == hi should fail")
	}
}
