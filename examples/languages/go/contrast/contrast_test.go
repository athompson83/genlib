// SPDX-License-Identifier: Apache-2.0

package contrast

import "testing"

func TestVectors(t *testing.T) {
	cases := []struct {
		a, b string
		want float64
	}{
		{"#000", "#fff", 21.0}, {"#767676", "#ffffff", 4.54}, {"#1a73e8", "#ffffff", 4.51},
		{"#abc", "#aabbcc", 1.0}, {"#ffff00", "#ffffff", 1.07},
	}
	for _, c := range cases {
		if got, err := Ratio2(c.a, c.b); err != nil || got != c.want {
			t.Fatalf("%s/%s: got %v err %v", c.a, c.b, got, err)
		}
	}
}

func TestPasses(t *testing.T) {
	grey, _ := Ratio("#767676", "#ffffff")
	yellow, _ := Ratio("#ffff00", "#ffffff")
	bw, _ := Ratio("#000", "#FFF")
	checks := []struct {
		ratio float64
		level string
		large bool
		want  bool
	}{
		{grey, "AA", false, true}, {grey, "AAA", false, false}, {yellow, "AA", true, false},
		{bw, "AAA", false, true}, {3.0, "AA", true, true},
	}
	for _, c := range checks {
		if got, err := Passes(c.ratio, c.level, c.large); err != nil || got != c.want {
			t.Fatalf("%+v: %v %v", c, got, err)
		}
	}
	if _, err := Passes(5, "A", false); err == nil {
		t.Fatal("level A accepted")
	}
}

func TestValidation(t *testing.T) {
	if l, _ := RelativeLuminance("#FFFFFF"); l != 1 {
		t.Fatal(l)
	}
	for _, bad := range []string{"fff", "#ffff", "#ggg", "#fffffff", ""} {
		if _, err := RelativeLuminance(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
