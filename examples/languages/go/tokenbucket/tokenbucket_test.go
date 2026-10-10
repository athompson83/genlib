// SPDX-License-Identifier: Apache-2.0

package tokenbucket

import "testing"

func TestVector(t *testing.T) {
	steps := []struct {
		now, cost int64
		allowed   bool
		tokens    int64
		retry     int64
	}{
		{0, 1, true, 4000, 0}, {0, 1, true, 3000, 0}, {0, 1, true, 2000, 0}, {0, 1, true, 1000, 0},
		{0, 1, true, 0, 0}, {0, 1, false, 0, 500}, {250, 1, false, 500, 250}, {500, 1, true, 0, 0},
		{500, 2, false, 0, 1000}, {3000, 5, true, 0, 0},
	}
	s, err := New(5, 0)
	if err != nil || s != (State{5000, 0}) {
		t.Fatalf("%+v %v", s, err)
	}
	for _, step := range steps {
		r, err := Take(s, step.now, step.cost, 5, 2)
		if err != nil || r.Allowed != step.allowed || r.State.TokensMilli != step.tokens || r.RetryAfterMs != step.retry {
			t.Fatalf("%+v: got %+v err %v", step, r, err)
		}
		s = r.State
	}
}

func TestClockBackwardsAndOverflow(t *testing.T) {
	r, _ := Take(State{0, 1000}, 500, 1, 5, 2)
	if r.Allowed || r.State != (State{0, 1000}) {
		t.Fatalf("%+v", r)
	}
	r, _ = Take(State{0, 0}, 1<<62, 1, 5, 1<<40)
	if !r.Allowed || r.State.TokensMilli != 4000 {
		t.Fatalf("%+v", r)
	}
}

func TestValidation(t *testing.T) {
	s, _ := New(5, 0)
	for _, args := range [][4]int64{{0, 6, 5, 2}, {0, 0, 5, 2}, {0, 1, 5, 0}, {-1, 1, 5, 2}, {0, 1, 0, 2}} {
		if _, err := Take(s, args[0], args[1], args[2], args[3]); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	if _, err := New(0, 0); err == nil {
		t.Fatal("zero capacity accepted")
	}
}
