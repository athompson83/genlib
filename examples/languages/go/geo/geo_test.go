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

// Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
func TestBoundingBoxLongitudeExtent(t *testing.T) {
	box, err := BoundingBox(60, 0, 0.1*EarthRadiusM)
	if err != nil {
		t.Fatal(err)
	}
	half := box.MaxLon * math.Pi / 180
	want := math.Asin(math.Sin(0.1) / math.Cos(math.Pi/3))
	if math.Abs(half-want) > 1e-6*want || math.Abs(half-0.20101) >= 1e-5 || math.Abs(box.MinLon+box.MaxLon) > 1e-12 {
		t.Fatalf("half-width %v rad, want %v (%+v)", half, want, box)
	}
}

func TestBoundingBoxContainsCircle(t *testing.T) {
	for _, cLat := range []float64{0, 45, 60, 75, -70} {
		for _, radius := range []float64{1000, 100000, 1000000} {
			box, err := BoundingBox(cLat, 0, radius)
			if err != nil {
				t.Fatal(err)
			}
			d := radius / EarthRadiusM
			p1 := cLat * math.Pi / 180
			for i := 0; i < 360; i++ {
				b := float64(i) * math.Pi / 180
				p2 := math.Asin(math.Sin(p1)*math.Cos(d) + math.Cos(p1)*math.Sin(d)*math.Cos(b))
				l2 := math.Atan2(math.Sin(b)*math.Sin(d)*math.Cos(p1), math.Cos(d)-math.Sin(p1)*math.Sin(p2))
				lat, lon := p2*180/math.Pi, l2*180/math.Pi
				if lat < box.MinLat-1e-9 || lat > box.MaxLat+1e-9 || lon < box.MinLon-1e-9 || lon > box.MaxLon+1e-9 {
					t.Fatalf("center %v, radius %v, bearing %d: %v,%v outside %+v", cLat, radius, i, lat, lon, box)
				}
			}
		}
	}
}

func TestBoundingBoxAntimeridian(t *testing.T) {
	for _, c := range [][2]float64{{179.9, 90}, {-179.9, 270}} {
		box, err := BoundingBox(10, c[0], 50000)
		if err != nil {
			t.Fatal(err)
		}
		if box.MinLon != -180 || box.MaxLon != 180 {
			t.Fatalf("center lon %v: want full longitude range, got %+v", c[0], box)
		}
		d, p1, b := 50000/EarthRadiusM, 10*math.Pi/180, c[1]*math.Pi/180
		p2 := math.Asin(math.Sin(p1)*math.Cos(d) + math.Cos(p1)*math.Sin(d)*math.Cos(b))
		l2 := c[0]*math.Pi/180 + math.Atan2(math.Sin(b)*math.Sin(d)*math.Cos(p1), math.Cos(d)-math.Sin(p1)*math.Sin(p2))
		lat, lon := p2*180/math.Pi, math.Mod(l2*180/math.Pi+540, 360)-180
		if math.Abs(lon) <= 179.5 || lat < box.MinLat || lat > box.MaxLat || lon < box.MinLon || lon > box.MaxLon {
			t.Fatalf("center lon %v, bearing %v: %v,%v outside %+v", c[0], c[1], lat, lon, box)
		}
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
