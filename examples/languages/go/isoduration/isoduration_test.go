// SPDX-License-Identifier: Apache-2.0

package isoduration

import "testing"

func TestParse(t *testing.T) {
	for _, c := range []struct {
		in   string
		want Duration
	}{
		{"P1Y2M3DT4H5M6S", Duration{1, 2, 0, 3, 4, 5, 6000}},
		{"PT1H30M", Duration{Hours: 1, Minutes: 30}},
		{"P2W", Duration{Weeks: 2}},
		{"PT0.5S", Duration{Milliseconds: 500}},
		{"PT36H", Duration{Hours: 36}},
		{"P0D", Duration{}},
		{"PT1.250S", Duration{Milliseconds: 1250}},
	} {
		if got, err := Parse(c.in); err != nil || got != c.want {
			t.Errorf("Parse(%q) = %+v, %v", c.in, got, err)
		}
	}
	for _, s := range []string{"P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", "", "P99999999999999999999D"} {
		if _, err := Parse(s); err == nil {
			t.Errorf("Parse(%q) accepted", s)
		}
	}
}

func TestMilliseconds(t *testing.T) {
	for _, c := range []struct {
		in   string
		want int64
	}{{"PT1H30M", 5400000}, {"P2W", 1209600000}, {"P1DT0.5S", 86400500}, {"PT36H", 129600000}} {
		d, _ := Parse(c.in)
		if got, err := Milliseconds(d); err != nil || got != c.want {
			t.Errorf("Milliseconds(%q) = %d, %v", c.in, got, err)
		}
	}
	for _, s := range []string{"P1Y", "P1M"} {
		d, _ := Parse(s)
		if _, err := Milliseconds(d); err == nil {
			t.Errorf("Milliseconds(%q) accepted", s)
		}
	}
	if _, err := Milliseconds(Duration{Weeks: 1 << 50}); err == nil {
		t.Error("overflow accepted")
	}
}

func TestFormat(t *testing.T) {
	for _, c := range []struct {
		ms   int64
		want string
	}{{0, "PT0S"}, {5400000, "PT1H30M"}, {90061001, "P1DT1H1M1.001S"}, {500, "PT0.5S"}, {129600000, "P1DT12H"}, {1209600000, "P14D"}} {
		if got, err := Format(c.ms); err != nil || got != c.want {
			t.Errorf("Format(%d) = %q, %v", c.ms, got, err)
		}
	}
	if _, err := Format(-1); err == nil {
		t.Error("negative accepted")
	}
}
