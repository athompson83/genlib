// SPDX-License-Identifier: Apache-2.0

package tilemath

import (
	"math"
	"testing"
)

func TestLonLatToTile(t *testing.T) {
	for _, c := range []struct {
		lon, lat float64
		z, x, y  int
	}{
		{-122.4194, 37.7749, 12, 655, 1583}, {0, 0, 0, 0, 0}, {2.3522, 48.8566, 15, 16598, 11273},
		{179.9999, -89.9, 3, 7, 7}, {-180, 85.1, 2, 0, 0},
	} {
		x, y, err := LonLatToTile(c.lon, c.lat, c.z)
		if err != nil || x != c.x || y != c.y {
			t.Errorf("LonLatToTile(%v, %v, %d) = %d, %d, %v", c.lon, c.lat, c.z, x, y, err)
		}
	}
	for _, c := range []struct {
		lon, lat float64
		z        int
	}{{0, 0, -1}, {0, 0, 25}, {181, 0, 1}, {math.NaN(), 0, 1}, {0, math.Inf(1), 1}} {
		if _, _, err := LonLatToTile(c.lon, c.lat, c.z); err == nil {
			t.Errorf("accepted %v", c)
		}
	}
}

func TestTileBounds(t *testing.T) {
	for _, c := range []struct {
		x, y, z int
		want    [4]float64
	}{
		{0, 0, 0, [4]float64{-180.0, -85.0511287798066, 180.0, 85.0511287798066}},
		{655, 1583, 12, [4]float64{-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046}},
		{1, 1, 1, [4]float64{0.0, -85.0511287798066, 180.0, 0.0}},
	} {
		got, err := TileBounds(c.x, c.y, c.z)
		if err != nil {
			t.Fatal(err)
		}
		for i := range got {
			if math.Abs(got[i]-c.want[i]) > 1e-9 {
				t.Errorf("TileBounds(%d,%d,%d) = %v want %v", c.x, c.y, c.z, got, c.want)
			}
		}
	}
	if _, err := TileBounds(2, 0, 1); err == nil {
		t.Error("x out of range accepted")
	}
	if _, err := TileBounds(0, -1, 1); err == nil {
		t.Error("negative y accepted")
	}
}

func TestQuadkey(t *testing.T) {
	for _, c := range []struct {
		x, y, z int
		key     string
	}{{3, 5, 3, "213"}, {655, 1583, 12, "023010203333"}, {0, 0, 1, "0"}, {0, 0, 0, ""}} {
		key, err := TileToQuadkey(c.x, c.y, c.z)
		if err != nil || key != c.key {
			t.Errorf("TileToQuadkey = %q, %v want %q", key, err, c.key)
		}
		x, y, z, err := QuadkeyToTile(c.key)
		if err != nil || x != c.x || y != c.y || z != c.z {
			t.Errorf("QuadkeyToTile(%q) = %d,%d,%d,%v", c.key, x, y, z, err)
		}
	}
	if _, _, _, err := QuadkeyToTile("0124"); err == nil {
		t.Error("digit 4 accepted")
	}
}

func TestMercator(t *testing.T) {
	for _, c := range []struct {
		lon, lat float64
		want     [2]float64
	}{
		{0, 0, [2]float64{0.0, -7.081154551613622e-10}},
		{-122.4194, 37.7749, [2]float64{-13627665.271218073, 4547675.354340557}},
		{180, 85.05112877980659, [2]float64{20037508.342789244, 20037508.342789244}},
	} {
		got, err := LonLatToMercator(c.lon, c.lat)
		if err != nil || math.Abs(got[0]-c.want[0]) > 1e-6 || math.Abs(got[1]-c.want[1]) > 1e-6 {
			t.Errorf("LonLatToMercator(%v, %v) = %v, %v", c.lon, c.lat, got, err)
		}
	}
	if _, err := LonLatToMercator(0, 85.06); err == nil {
		t.Error("latitude beyond Mercator limit accepted")
	}
}
