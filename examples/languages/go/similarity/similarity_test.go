// SPDX-License-Identifier: Apache-2.0

package similarity

import (
	"math"
	"testing"
)

func TestPairs(t *testing.T) {
	for _, c := range []struct {
		a, b                     string
		lev, osa                 int
		jaro, jaroWinkler, ratio float64
	}{
		{"kitten", "sitting", 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714},
		{"flaw", "lawn", 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5},
		{"", "", 0, 0, 1.0, 1.0, 1.0},
		{"", "abc", 3, 3, 0.0, 0.0, 0.0},
		{"abc", "abc", 0, 0, 1.0, 1.0, 1.0},
		{"ca", "abc", 3, 3, 0.0, 0.0, 0.0},
		{"MARTHA", "MARHTA", 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667},
		{"DIXON", "DICKSONX", 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5},
		{"DWAYNE", "DUANE", 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667},
		{"café", "cafe", 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75},
		{"naïve", "naive", 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8},
		{"🙂ab", "ab🙂", 2, 2, 0.0, 0.0, 0.33333333333333337},
		{"JELLYFISH", "SMELLYFISH", 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8},
	} {
		if got := Levenshtein(c.a, c.b); got != c.lev {
			t.Errorf("Levenshtein(%q, %q) = %d", c.a, c.b, got)
		}
		if got := DamerauOSA(c.a, c.b); got != c.osa {
			t.Errorf("DamerauOSA(%q, %q) = %d", c.a, c.b, got)
		}
		for _, f := range []struct {
			name      string
			got, want float64
		}{{"Jaro", Jaro(c.a, c.b), c.jaro}, {"JaroWinkler", JaroWinkler(c.a, c.b), c.jaroWinkler}, {"Ratio", Ratio(c.a, c.b), c.ratio}} {
			if math.Abs(f.got-f.want) > 1e-12 {
				t.Errorf("%s(%q, %q) = %v, want %v", f.name, c.a, c.b, f.got, f.want)
			}
		}
	}
}
