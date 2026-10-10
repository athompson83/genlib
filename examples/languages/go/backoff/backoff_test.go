// SPDX-License-Identifier: Apache-2.0

package backoff

import "testing"

func TestDelayVectors(t *testing.T) {
	cases := []struct {
		attempt   int
		base, cap int64
		fraction  float64
		want      int64
	}{
		{0, 100, 10000, 0.5, 50}, {3, 100, 10000, 0.999, 799}, {10, 100, 10000, 0.25, 2500},
		{3, 100, 10000, 0.0, 0}, {1000000, 100, 10000, 0.5, 5000}, {62, 1, 1 << 62, 0.5, 1 << 61},
		{63, 1, 1<<63 - 1, 0.0, 0},
	}
	for _, c := range cases {
		if got, err := Delay(c.attempt, c.base, c.cap, c.fraction); err != nil || got != c.want {
			t.Fatalf("%+v: got %d err %v", c, got, err)
		}
	}
}

func TestDelayValidation(t *testing.T) {
	for _, c := range [][4]float64{{-1, 100, 1000, 0.1}, {0, 0, 1000, 0.1}, {0, 100, 50, 0.1}, {0, 100, 1000, 1}, {0, 100, 1000, -0.1}} {
		if _, err := Delay(int(c[0]), int64(c[1]), int64(c[2]), c[3]); err == nil {
			t.Fatalf("accepted %v", c)
		}
	}
}

func TestRetryAfter(t *testing.T) {
	cases := []struct {
		value string
		now   int64
		want  int64
	}{
		{"120", 0, 120000},
		{"Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000, 30000},
		{"Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000, 0},
	}
	for _, c := range cases {
		if got, err := RetryAfterMs(c.value, c.now); err != nil || got != c.want {
			t.Fatalf("%s: got %d err %v", c.value, got, err)
		}
	}
	for _, bad := range []string{"", "-5", "1.5", "soon", "Wed, 21 Oct 2026 07:28:00 UTC", "Thu, 21 Oct 2026 07:28:00 GMT",
		"Wed, 32 Oct 2026 07:28:00 GMT", "99999999999999999999"} {
		if _, err := RetryAfterMs(bad, 0); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
