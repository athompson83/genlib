// SPDX-License-Identifier: Apache-2.0

package breaker

import "testing"

type step struct {
	op   string
	now  int64
	want interface{}
}

func TestScripts(t *testing.T) {
	for n, c := range []struct {
		threshold int
		cooldown  int64
		max       int
		steps     []step
	}{
		{2, 1000, 1, []step{{"allow", 0, true}, {"failure", 0, nil}, {"state", 0, "closed"}, {"failure", 10, nil}, {"state", 10, "open"}, {"allow", 500, false}, {"retry_after", 500, int64(510)}, {"state", 1010, "half_open"}, {"allow", 1010, true}, {"allow", 1011, false}, {"success", 1020, nil}, {"state", 1020, "closed"}, {"allow", 1021, true}}},
		{3, 500, 2, []step{{"failure", 0, nil}, {"success", 1, nil}, {"failure", 2, nil}, {"failure", 3, nil}, {"state", 3, "closed"}, {"failure", 4, nil}, {"state", 4, "open"}, {"state", 503, "open"}, {"allow", 504, true}, {"allow", 505, true}, {"allow", 506, false}, {"failure", 507, nil}, {"state", 507, "open"}, {"retry_after", 600, int64(407)}, {"state", 1007, "half_open"}, {"allow", 1008, true}, {"success", 1009, nil}, {"state", 1009, "closed"}}},
		{1, 0, 1, []step{{"failure", 5, nil}, {"state", 5, "half_open"}, {"allow", 5, true}, {"allow", 5, false}, {"failure", 6, nil}, {"state", 6, "half_open"}, {"allow", 6, true}}},
	} {
		b, err := New(c.threshold, c.cooldown, c.max)
		if err != nil {
			t.Fatal(err)
		}
		for i, s := range c.steps {
			var got interface{}
			switch s.op {
			case "allow":
				got = b.Allow(s.now)
			case "success":
				b.RecordSuccess(s.now)
			case "failure":
				b.RecordFailure(s.now)
			case "state":
				got = string(b.State(s.now))
			case "retry_after":
				got = b.RetryAfterMs(s.now)
			}
			if got != s.want {
				t.Errorf("script %d step %d %s@%d = %v, want %v", n, i, s.op, s.now, got, s.want)
			}
		}
	}
}

func TestInvalid(t *testing.T) {
	if _, err := New(0, 1000, 1); err == nil {
		t.Error("New(0, 1000, 1) should fail")
	}
	if _, err := New(1, -1, 1); err == nil {
		t.Error("New(1, -1, 1) should fail")
	}
	if _, err := New(1, 1000, 0); err == nil {
		t.Error("New(1, 1000, 0) should fail")
	}
	if b, err := New(DefaultFailureThreshold, DefaultCooldownMs, DefaultHalfOpenMax); err != nil || b.State(0) != Closed {
		t.Error("defaults should build a closed breaker")
	}
}
