// SPDX-License-Identifier: Apache-2.0

package semver

import (
	"reflect"
	"testing"
)

func mustParse(t *testing.T, s string) Version {
	t.Helper()
	v, err := Parse(s)
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func TestSortVector(t *testing.T) {
	want := []string{"0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
		"1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0"}
	input := []string{"2.0.0", "1.0.0-beta.11", "1.0.0", "1.0.0-alpha.beta", "1.0.0+build.5", "0.9.9", "1.0.0-rc.1",
		"1.0.0-alpha", "1.0.0-beta.2", "1.0.0-alpha.1", "1.0.0-beta"}
	vs := make([]Version, len(input))
	for i, s := range input {
		vs[i] = mustParse(t, s)
	}
	Sort(vs)
	got := make([]string, len(vs))
	for i, v := range vs {
		got[i] = v.String()
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
	if Compare(mustParse(t, "1.0.0"), mustParse(t, "1.0.0+build.5")) != 0 {
		t.Fatal("build metadata affected precedence")
	}
}

func TestSatisfiesVectors(t *testing.T) {
	cases := []struct {
		version, rng string
		want         bool
	}{
		{"1.2.3", "^1.0.0", true}, {"2.0.0", "^1.0.0", false}, {"0.2.5", "^0.2.3", true},
		{"0.3.0", "^0.2.3", false}, {"0.0.4", "^0.0.3", false}, {"1.2.9", "~1.2.3", true},
		{"1.3.0", "~1.2.3", false}, {"1.5.0", "1.x", true}, {"1.5.0", ">=1.2.0 <1.5.0", false},
		{"1.4.9", ">=1.2.0 <1.5.0", true}, {"3.1.0", "^1.0.0 || ^3.0.0", true},
		{"1.2.3-beta.2", "^1.2.3-beta.1", true}, {"1.2.4-beta.1", "^1.2.3-beta.1", false},
		{"1.3.0-rc.1", "^1.2.0", false}, {"1.2.0", "1.0.0 - 1.2.0", true}, {"1.2.1", "1.0.0 - 1.2.0", false},
		{"0.0.1", "*", true}, {"2.0.0", "<=1.x", false},
		// Extra cases.
		{"1.9.9", "<=1.x", true}, {"0.0.3", "^0.0.3", true}, {"1.2.3", ">= 1.2.3", true},
		{"2.3.9", "1.2 - 2.3", true}, {"2.4.0", "1.2 - 2.3", false}, {"1.0.0-rc.1", "*", false},
		{"1.9.0", ">1.x", false}, {"2.0.0", ">1.x", true}, {"1.2.3", "1.2.3", true}, {"1.0.0", "<0.x", false},
		{"1.0.0-beta.10", "1.0.0-beta.2 - 1.0.0-beta.11", true},
	}
	for _, c := range cases {
		got, err := Satisfies(mustParse(t, c.version), c.rng)
		if err != nil || got != c.want {
			t.Fatalf("%s %q: got %v err %v", c.version, c.rng, got, err)
		}
	}
}

func TestParse(t *testing.T) {
	v := mustParse(t, "1.2.3-rc.1+b.7")
	if !reflect.DeepEqual(v, Version{1, 2, 3, []string{"rc", "1"}, []string{"b", "7"}}) || v.String() != "1.2.3-rc.1+b.7" {
		t.Fatalf("%+v", v)
	}
	for _, bad := range []string{"1.2", "01.2.3", "1.2.3-01", "v1.2.3", "1.2.3-", "1.2.3+", " 1.2.3", "1.2.3-a..b",
		"99999999999999999999.0.0"} {
		if _, err := Parse(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, err := Satisfies(v, ">=abc"); err == nil {
		t.Fatal("invalid range accepted")
	}
}
