// SPDX-License-Identifier: Apache-2.0

package calculator

import (
	"strings"
	"testing"
)

func TestEvaluate(t *testing.T) {
	cases := map[string]float64{
		"2 + 3 * 4": 14, "(2+3)*4": 20, "2^3^2": 512, "-2^2": -4,
		"10 % 4": 2, "-7 % 3": -1, "1.5e2 / 3": 50, "2^-1": 0.5,
	}
	for in, want := range cases {
		got, err := Evaluate(in, nil)
		if err != nil || got != want {
			t.Fatalf("%q: got %v err %v want %v", in, got, err, want)
		}
	}
	got, err := Evaluate("a*2+b", map[string]float64{"a": 3, "b": 0.5})
	if err != nil || got != 6.5 {
		t.Fatalf("variables: got %v err %v", got, err)
	}
}

func TestEvaluateErrors(t *testing.T) {
	for _, in := range []string{"1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "1e", "2 $ 3", "10^400", strings.Repeat("1", 1001), strings.Repeat("(", 300) + "1" + strings.Repeat(")", 300)} {
		if v, err := Evaluate(in, nil); err == nil {
			t.Fatalf("%q: expected error, got %v", in, v)
		}
	}
}

func TestDepthLimit(t *testing.T) {
	if _, err := Evaluate(strings.Repeat("(", 300)+"1"+strings.Repeat(")", 300), nil); err != errTooDeep {
		t.Fatalf("want depth error, got %v", err)
	}
	if v, err := Evaluate(strings.Repeat("(", 150)+"1"+strings.Repeat(")", 150), nil); err != nil || v != 1 {
		t.Fatalf("got %v %v", v, err)
	}
}

func TestLoanPayment(t *testing.T) {
	for _, c := range []struct {
		p, r float64
		n    int
		want float64
	}{{200000, 6, 360, 1199.10}, {10000, 0, 10, 1000.00}, {1000, 12, 12, 88.85}} {
		got, err := LoanPayment(c.p, c.r, c.n)
		if err != nil || got != c.want {
			t.Fatalf("%v: got %v err %v", c, got, err)
		}
	}
	if _, err := LoanPayment(1000, 5, 0); err == nil {
		t.Fatal("accepted zero months")
	}
}

func TestAmortizationSchedule(t *testing.T) {
	rows, err := AmortizationSchedule(1000, 12, 12)
	if err != nil || len(rows) != 12 {
		t.Fatalf("rows %d err %v", len(rows), err)
	}
	if r := rows[0]; r.Period != 1 || r.Payment != 88.85 || r.Interest != 10.00 || r.Principal != 78.85 || r.Balance != 921.15 {
		t.Fatalf("row 1: %+v", r)
	}
	if rows[11].Balance != 0 {
		t.Fatalf("last balance %v", rows[11].Balance)
	}
	var cents int64
	for _, r := range rows {
		cents += int64(r.Principal*100 + 0.5)
	}
	if cents != 100000 {
		t.Fatalf("principal sum %d cents", cents)
	}
}

func TestCompoundInterest(t *testing.T) {
	got, err := CompoundInterest(1000, 5, 12, 10)
	if err != nil || got != 1647.01 {
		t.Fatalf("got %v err %v", got, err)
	}
}
