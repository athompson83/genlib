// SPDX-License-Identifier: Apache-2.0

package money

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

func TestToMinor(t *testing.T) {
	cases := []struct {
		amount, currency string
		want             int64
	}{{"12.34", "USD", 1234}, {"-0.5", "USD", -50}, {"1000", "JPY", 1000}, {"1.234", "BHD", 1234}, {"7", "USD", 700}}
	for _, c := range cases {
		if got, err := ToMinor(c.amount, c.currency); err != nil || got != c.want {
			t.Fatalf("%s %s: got %d err %v", c.amount, c.currency, got, err)
		}
	}
	for _, bad := range [][2]string{{"1.5", "JPY"}, {"12.345", "USD"}, {"1,000.00", "USD"}, {".5", "USD"}, {"5.", "USD"},
		{"1e3", "USD"}, {" 1", "USD"}, {"+1", "USD"}, {"12", "XXX"}, {"12", "usd"}} {
		if _, err := ToMinor(bad[0], bad[1]); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, err := ToMinor("92233720368547758.08", "USD"); !errors.Is(err, ErrOverflow) {
		t.Fatalf("overflow: %v", err)
	}
}

func TestFormatMinor(t *testing.T) {
	cases := []struct {
		minor    int64
		currency string
		want     string
	}{{1234, "USD", "12.34"}, {-5, "USD", "-0.05"}, {500, "JPY", "500"}, {1, "BHD", "0.001"}, {0, "EUR", "0.00"},
		{math.MinInt64, "USD", "-92233720368547758.08"}}
	for _, c := range cases {
		if got, err := FormatMinor(c.minor, c.currency); err != nil || got != c.want {
			t.Fatalf("%d %s: got %q err %v", c.minor, c.currency, got, err)
		}
	}
	if _, err := FormatMinor(1, "XXX"); err == nil {
		t.Fatal("accepted XXX")
	}
}

func TestApplyRate(t *testing.T) {
	cases := []struct {
		minor int64
		rate  string
		want  int64
	}{{1999, "0.0825", 165}, {25, "0.5", 12}, {35, "0.5", 18}, {-25, "0.5", -12}, {1000, "1.07", 1070}}
	for _, c := range cases {
		if got, err := ApplyRate(c.minor, c.rate); err != nil || got != c.want {
			t.Fatalf("%d * %s: got %d err %v", c.minor, c.rate, got, err)
		}
	}
	for _, bad := range []string{"0.0000000001", "1e2", ""} {
		if _, err := ApplyRate(1, bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, err := ApplyRate(1<<62, "2"); !errors.Is(err, ErrOverflow) {
		t.Fatalf("overflow: %v", err)
	}
}

func TestAllocate(t *testing.T) {
	cases := []struct {
		total  int64
		ratios []int64
		want   []int64
	}{{100, []int64{1, 1, 1}, []int64{34, 33, 33}}, {5, []int64{3, 7}, []int64{2, 3}},
		{-100, []int64{1, 1, 1}, []int64{-34, -33, -33}}, {1000, []int64{0, 1}, []int64{0, 1000}},
		{math.MinInt64, []int64{1}, []int64{math.MinInt64}},
		{1, []int64{3, 7}, []int64{0, 1}}, {1, []int64{0, 1, 1}, []int64{0, 1, 0}}, {10, []int64{1, 8}, []int64{1, 9}}}
	for _, c := range cases {
		if got, err := Allocate(c.total, c.ratios); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Fatalf("%d %v: got %v err %v", c.total, c.ratios, got, err)
		}
	}
	for _, bad := range [][]int64{nil, {0, 0}, {1, -1}} {
		if _, err := Allocate(10, bad); err == nil {
			t.Fatalf("accepted %v", bad)
		}
	}
}
