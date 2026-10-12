// SPDX-License-Identifier: Apache-2.0

package featureflags

import (
	"strconv"
	"testing"
)

func pct(v float64) *float64 { return &v }
func no() *bool              { v := false; return &v }

func TestEvaluate(t *testing.T) {
	checkout := Flag{Key: "new-checkout", RolloutPercent: pct(25)}
	lists := Flag{Key: "new-checkout", RolloutPercent: pct(25), Allow: []string{"user-2"}, Deny: []string{"user-1"}}
	pricing := Flag{Key: "pricing-test", Variants: []Variant{{"control", 50}, {"annual-first", 30}, {"monthly-first", 20}}}
	for _, c := range []struct {
		f    Flag
		user string
		want Result
	}{
		{checkout, "user-1", Result{true, "rollout", 849, ""}},
		{checkout, "user-2", Result{false, "excluded", 5308, ""}},
		{checkout, "user-3", Result{false, "excluded", 5247, ""}},
		{checkout, "user-42", Result{false, "excluded", 9209, ""}},
		{checkout, "alice@example.com", Result{false, "excluded", 9060, ""}},
		{lists, "user-1", Result{false, "deny", 849, ""}},
		{lists, "user-2", Result{true, "allow", 5308, ""}},
		{Flag{Key: "beta", Enabled: no(), Allow: []string{"vip"}}, "vip", Result{false, "disabled", 8844, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(0)}, "user-1", Result{false, "excluded", 6875, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(100)}, "user-1", Result{true, "rollout", 6875, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(12.34)}, "user-9", Result{false, "excluded", 8197, ""}},
		{pricing, "u1", Result{true, "rollout", 6435, "control"}},
		{pricing, "u2", Result{true, "rollout", 401, "annual-first"}},
		{pricing, "u3", Result{true, "rollout", 9955, "monthly-first"}},
		{pricing, "u4", Result{true, "rollout", 8249, "annual-first"}},
		{pricing, "u5", Result{true, "rollout", 6254, "control"}},
		{pricing, "ünïcode", Result{true, "rollout", 7068, "control"}},
	} {
		if got, err := Evaluate(c.f, c.user); err != nil || got != c.want {
			t.Errorf("Evaluate(%s, %q) = %+v, %v; want %+v", c.f.Key, c.user, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, f := range []Flag{
		{Key: "bad key"},
		{Key: "k", RolloutPercent: pct(101)},
		{Key: "k", RolloutPercent: pct(12.345)},
		{Key: "k", Variants: []Variant{{"a", 0}}},
		{Key: ""},
	} {
		if got, err := Evaluate(f, "u"); err == nil {
			t.Errorf("Evaluate(%+v) = %+v, want error", f, got)
		}
	}
}

// chiSquare2x2 is the chi-square statistic of the 2x2 contingency table of
// two 0/1 assignments.
func chiSquare2x2(t [2][2]float64) float64 {
	n := t[0][0] + t[0][1] + t[1][0] + t[1][1]
	chi := 0.0
	for i := 0; i < 2; i++ {
		for j := 0; j < 2; j++ {
			e := (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n
			chi += (t[i][j] - e) * (t[i][j] - e) / e
		}
	}
	return chi
}

// Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50
// experiments with similar keys put every subject in the same half of both.
// The fmix32 finalizer must keep them independent.
func TestExperimentsAreIndependent(t *testing.T) {
	ab := []Variant{{"a", 1}, {"b", 1}}
	for _, keys := range [][2]string{{"checkout-a", "checkout-b"}, {"exp1", "exp2"}} {
		var parity, arms [2][2]float64
		for i := 0; i < 10000; i++ {
			u := "u" + strconv.Itoa(i)
			r1, _ := Evaluate(Flag{Key: keys[0]}, u)
			r2, _ := Evaluate(Flag{Key: keys[1]}, u)
			parity[r1.Bucket%2][r2.Bucket%2]++
			v1, _ := Evaluate(Flag{Key: keys[0], Variants: ab}, u)
			v2, _ := Evaluate(Flag{Key: keys[1], Variants: ab}, u)
			arms[b2i(v1.Variant == "b")][b2i(v2.Variant == "b")]++
		}
		if chi := chiSquare2x2(parity); !(chi < 10.83) {
			t.Errorf("bucket parity %v chi-square %.2f, want < 10.83", keys, chi)
		}
		if chi := chiSquare2x2(arms); !(chi < 10.83) {
			t.Errorf("50/50 variants %v chi-square %.2f, want < 10.83", keys, chi)
		}
	}
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

func TestBucketsAreUniform(t *testing.T) {
	var counts [100]int
	for i := 0; i < 10000; i++ {
		r, _ := Evaluate(Flag{Key: "checkout-a"}, "u"+strconv.Itoa(i))
		counts[r.Bucket%100]++
	}
	for b, n := range counts {
		if n < 60 || n > 140 {
			t.Errorf("bucket %d has %d subjects, want 100 +/- 40", b, n)
		}
	}
}
