// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package pagination

import (
	"errors"
	"reflect"
	"testing"
)

func TestPageCount(t *testing.T) {
	for _, c := range [][3]int{{0, 10, 1}, {1, 10, 1}, {10, 10, 1}, {11, 10, 2}, {999, 25, 40}, {5, 1, 5}} {
		if got, err := PageCount(c[0], c[1]); err != nil || got != c[2] {
			t.Errorf("PageCount(%d, %d) = %d, %v", c[0], c[1], got, err)
		}
	}
	for _, c := range [][2]int{{-1, 10}, {5, 0}, {5, 1001}} {
		if _, err := PageCount(c[0], c[1]); !errors.Is(err, ErrPage) {
			t.Errorf("PageCount(%d, %d) should fail", c[0], c[1])
		}
	}
}

func TestPageOffset(t *testing.T) {
	for _, c := range [][3]int{{1, 20, 0}, {3, 20, 40}} {
		if got, err := PageOffset(c[0], c[1]); err != nil || got != c[2] {
			t.Errorf("PageOffset(%d, %d) = %d, %v", c[0], c[1], got, err)
		}
	}
	if _, err := PageOffset(0, 10); err == nil {
		t.Error("PageOffset(0, 10) should fail")
	}
}

func TestPageWindow(t *testing.T) {
	for _, c := range []struct {
		args [4]int
		want []int
	}{
		{[4]int{1, 1, 1, 1}, []int{1}},
		{[4]int{1, 2, 1, 1}, []int{1, 2}},
		{[4]int{2, 2, 1, 1}, []int{1, 2}},
		{[4]int{1, 3, 1, 1}, []int{1, 2, 3}},
		{[4]int{2, 3, 1, 1}, []int{1, 2, 3}},
		{[4]int{3, 3, 1, 1}, []int{1, 2, 3}},
		{[4]int{1, 5, 1, 1}, []int{1, 2, 3, 4, 5}},
		{[4]int{2, 5, 1, 1}, []int{1, 2, 3, 4, 5}},
		{[4]int{3, 5, 1, 1}, []int{1, 2, 3, 4, 5}},
		{[4]int{4, 5, 1, 1}, []int{1, 2, 3, 4, 5}},
		{[4]int{5, 5, 1, 1}, []int{1, 2, 3, 4, 5}},
		{[4]int{1, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{2, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{3, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{4, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{5, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{6, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{7, 7, 1, 1}, []int{1, 2, 3, 4, 5, 6, 7}},
		{[4]int{1, 8, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 8}},
		{[4]int{2, 8, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 8}},
		{[4]int{3, 8, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 8}},
		{[4]int{4, 8, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 8}},
		{[4]int{6, 8, 1, 1}, []int{1, Gap, 4, 5, 6, 7, 8}},
		{[4]int{7, 8, 1, 1}, []int{1, Gap, 4, 5, 6, 7, 8}},
		{[4]int{8, 8, 1, 1}, []int{1, Gap, 4, 5, 6, 7, 8}},
		{[4]int{1, 10, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 10}},
		{[4]int{2, 10, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 10}},
		{[4]int{3, 10, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 10}},
		{[4]int{4, 10, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 10}},
		{[4]int{5, 10, 1, 1}, []int{1, Gap, 4, 5, 6, Gap, 10}},
		{[4]int{8, 10, 1, 1}, []int{1, Gap, 6, 7, 8, 9, 10}},
		{[4]int{9, 10, 1, 1}, []int{1, Gap, 6, 7, 8, 9, 10}},
		{[4]int{10, 10, 1, 1}, []int{1, Gap, 6, 7, 8, 9, 10}},
		{[4]int{1, 20, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 20}},
		{[4]int{2, 20, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 20}},
		{[4]int{3, 20, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 20}},
		{[4]int{4, 20, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 20}},
		{[4]int{10, 20, 1, 1}, []int{1, Gap, 9, 10, 11, Gap, 20}},
		{[4]int{18, 20, 1, 1}, []int{1, Gap, 16, 17, 18, 19, 20}},
		{[4]int{19, 20, 1, 1}, []int{1, Gap, 16, 17, 18, 19, 20}},
		{[4]int{20, 20, 1, 1}, []int{1, Gap, 16, 17, 18, 19, 20}},
		{[4]int{1, 100, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 100}},
		{[4]int{2, 100, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 100}},
		{[4]int{3, 100, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 100}},
		{[4]int{4, 100, 1, 1}, []int{1, 2, 3, 4, 5, Gap, 100}},
		{[4]int{50, 100, 1, 1}, []int{1, Gap, 49, 50, 51, Gap, 100}},
		{[4]int{98, 100, 1, 1}, []int{1, Gap, 96, 97, 98, 99, 100}},
		{[4]int{99, 100, 1, 1}, []int{1, Gap, 96, 97, 98, 99, 100}},
		{[4]int{100, 100, 1, 1}, []int{1, Gap, 96, 97, 98, 99, 100}},
		{[4]int{10, 20, 2, 1}, []int{1, Gap, 8, 9, 10, 11, 12, Gap, 20}},
		{[4]int{10, 20, 0, 1}, []int{1, Gap, 10, Gap, 20}},
		{[4]int{10, 20, 1, 2}, []int{1, 2, Gap, 9, 10, 11, Gap, 19, 20}},
		{[4]int{1, 20, 2, 2}, []int{1, 2, 3, 4, 5, 6, 7, 8, Gap, 19, 20}},
		{[4]int{20, 20, 2, 2}, []int{1, 2, Gap, 13, 14, 15, 16, 17, 18, 19, 20}},
		{[4]int{50, 100, 3, 3}, []int{1, 2, 3, Gap, 47, 48, 49, 50, 51, 52, 53, Gap, 98, 99, 100}},
	} {
		if got, err := PageWindow(c.args[0], c.args[1], c.args[2], c.args[3]); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("PageWindow%v = %v, %v; want %v", c.args, got, err, c.want)
		}
	}
	for _, c := range [][4]int{{0, 10, 1, 1}, {11, 10, 1, 1}, {1, 0, 1, 1}, {1, 10, 6, 1}, {1, 10, 1, 0}} {
		if _, err := PageWindow(c[0], c[1], c[2], c[3]); !errors.Is(err, ErrPage) {
			t.Errorf("PageWindow%v should fail", c)
		}
	}
}
