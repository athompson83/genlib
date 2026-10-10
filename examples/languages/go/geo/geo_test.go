// SPDX-License-Identifier: Apache-2.0

package geo

import (
	"math"
	"testing"
)

func TestHaversineVectors(t *testing.T) {
	cases := []struct {
		a, b, c, d float64
		want       float64
	}{
		{51.5074, -0.1278, 48.8566, 2.3522, 343557}, {10, 10, 10, 10, 0}, {0, 0, 0, 180, 20015114},
	}
	for _, c := range cases {
		if got, err := HaversineMeters(c.a, c.b, c.c, c.d); err != nil || math.Round(got) != c.want {
			t.Fatalf("%+v: got %v err %v", c, got, err)
		}
	}
}

func TestGeohash(t *testing.T) {
	cases := []struct {
		lat, lon  float64
		precision int
		want      string
	}{
		{37.7749, -122.4194, 9, "9q8yyk8yt"}, {0, 0, 5, "s0000"}, {-33.8688, 151.2093, 7, "r3gx2f7"},
	}
	for _, c := range cases {
		got, err := GeohashEncode(c.lat, c.lon, c.precision)
		if err != nil || got != c.want {
			t.Fatalf("%+v: got %q err %v", c, got, err)
		}
		cell, err := GeohashDecode(got)
		if err != nil || math.Abs(cell.Lat-c.lat) > cell.LatErr || math.Abs(cell.Lon-c.lon) > cell.LonErr {
			t.Fatalf("decode %s: %+v %v", got, cell, err)
		}
	}
	upper, _ := GeohashDecode("S0000")
	lower, _ := GeohashDecode("s0000")
	if upper != lower {
		t.Fatal("decode is case-sensitive")
	}
}

func TestBoundingBox(t *testing.T) {
	box, err := BoundingBox(51.5, -0.12, 10000)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range [][2]float64{{box.MaxLat, -0.12}, {box.MinLat, -0.12}, {51.5, box.MaxLon}, {51.5, box.MinLon}} {
		if d, _ := HaversineMeters(51.5, -0.12, p[0], p[1]); d < 10000-1 {
			t.Fatalf("side %v is only %v m away", p, d)
		}
	}
	polar, _ := BoundingBox(89.95, 0, 10000)
	if polar.MinLon != -180 || polar.MaxLon != 180 || polar.MaxLat != 90 {
		t.Fatalf("%+v", polar)
	}
}

func TestValidation(t *testing.T) {
	if _, err := HaversineMeters(91, 0, 0, 0); err == nil {
		t.Fatal("lat 91 accepted")
	}
	if _, err := HaversineMeters(0, 181, 0, 0); err == nil {
		t.Fatal("lon 181 accepted")
	}
	for _, bad := range []string{"", "abc!", "a", "0123456789bcd"} {
		if _, err := GeohashDecode(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	for _, p := range []int{0, 13} {
		if _, err := GeohashEncode(0, 0, p); err == nil {
			t.Fatalf("precision %d accepted", p)
		}
	}
	if _, err := BoundingBox(0, 0, -1); err == nil {
		t.Fatal("negative radius accepted")
	}
}
