// SPDX-License-Identifier: Apache-2.0

package featureflags

import "testing"

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
		{checkout, "user-1", Result{false, "excluded", 4063, ""}},
		{checkout, "user-2", Result{true, "rollout", 1682, ""}},
		{checkout, "user-3", Result{false, "excluded", 9301, ""}},
		{checkout, "user-42", Result{false, "excluded", 9926, ""}},
		{checkout, "alice@example.com", Result{false, "excluded", 2919, ""}},
		{lists, "user-1", Result{false, "deny", 4063, ""}},
		{lists, "user-2", Result{true, "allow", 1682, ""}},
		{Flag{Key: "beta", Enabled: no(), Allow: []string{"vip"}}, "vip", Result{false, "disabled", 3546, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(0)}, "user-1", Result{false, "excluded", 6646, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(100)}, "user-1", Result{true, "rollout", 6646, ""}},
		{Flag{Key: "banner", RolloutPercent: pct(12.34)}, "user-9", Result{false, "excluded", 7598, ""}},
		{pricing, "u1", Result{true, "rollout", 4196, "monthly-first"}},
		{pricing, "u2", Result{true, "rollout", 7053, "control"}},
		{pricing, "u3", Result{true, "rollout", 9434, "annual-first"}},
		{pricing, "u4", Result{true, "rollout", 1339, "annual-first"}},
		{pricing, "u5", Result{true, "rollout", 3720, "annual-first"}},
		{pricing, "ünïcode", Result{true, "rollout", 9874, "control"}},
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
