// SPDX-License-Identifier: Apache-2.0

package polyline

import (
	"math"
	"testing"
)

var vectors = []struct {
	points    []Point
	precision int
	encoded   string
}{
	{[]Point{{38.5, -120.2}, {40.7, -120.95}, {43.252, -126.453}}, 5, "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
	{[]Point{{47.6062, -122.3321}, {47.6205, -122.3493}}, 6, "ozsxyAf{pihFw|Z~q`@"},
	{[]Point{}, 5, ""},
}

func TestVectorsAndRoundTrip(t *testing.T) {
	for _, v := range vectors {
		got, err := Encode(v.points, v.precision)
		if err != nil || got != v.encoded {
			t.Fatalf("Encode = %q, %v; want %q", got, err, v.encoded)
		}
		back, err := Decode(v.encoded, v.precision)
		if err != nil || len(back) != len(v.points) {
			t.Fatalf("Decode(%q) = %v, %v", v.encoded, back, err)
		}
		tol := 0.5 * math.Pow(10, -float64(v.precision))
		for i, p := range back {
			if math.Abs(p.Lat-v.points[i].Lat) > tol || math.Abs(p.Lon-v.points[i].Lon) > tol {
				t.Fatalf("point %d: %v vs %v", i, p, v.points[i])
			}
		}
	}
}

func TestRejects(t *testing.T) {
	for _, s := range []string{"_p~iF~ps|U_", "_p~iF", "_p~iF~ps|U!!", "abc\x7f"} {
		if _, err := Decode(s, 5); err == nil {
			t.Errorf("Decode(%q) accepted", s)
		}
	}
	if _, err := Encode([]Point{{math.NaN(), 0}}, 5); err == nil {
		t.Error("NaN accepted")
	}
	if _, err := Encode([]Point{{91, 0}}, 5); err == nil {
		t.Error("latitude 91 accepted")
	}
	if _, err := Encode(nil, 11); err == nil {
		t.Error("precision 11 accepted")
	}
}
