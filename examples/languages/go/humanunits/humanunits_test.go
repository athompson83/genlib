// SPDX-License-Identifier: Apache-2.0

package humanunits

import "testing"

func TestFormatBytes(t *testing.T) {
	for _, c := range []struct {
		n        int64
		base     Base
		decimals int
		want     string
	}{
		{0, SI, 1, "0 B"}, {999, SI, 1, "999 B"}, {1000, SI, 1, "1 kB"}, {1536, IEC, 1, "1.5 KiB"},
		{1536, SI, 1, "1.5 kB"}, {999950, SI, 1, "1 MB"}, {999949, SI, 1, "999.9 kB"}, {1048576, IEC, 2, "1 MiB"},
		{123456789, SI, 2, "123.46 MB"}, {123456789, IEC, 0, "118 MiB"}, {9223372036854775807, IEC, 3, "8 EiB"},
		{1023, IEC, 1, "1023 B"}, {1024, IEC, 1, "1 KiB"}, {5000000000000, SI, 1, "5 TB"},
	} {
		if got, err := FormatBytes(c.n, c.base, c.decimals); err != nil || got != c.want {
			t.Errorf("FormatBytes(%d, %d, %d) = %q, %v; want %q", c.n, c.base, c.decimals, got, err, c.want)
		}
	}
	for _, c := range [][2]int64{{-1, 1}, {1, 4}, {1, -1}} {
		if _, err := FormatBytes(c[0], SI, int(c[1])); err == nil {
			t.Errorf("FormatBytes(%d, %d) want error", c[0], c[1])
		}
	}
}

func TestParseBytes(t *testing.T) {
	for _, c := range []struct {
		in   string
		want int64
	}{
		{"0", 0}, {"512", 512}, {"1kB", 1000}, {"1 KiB", 1024}, {"1.5 GiB", 1610612736}, {"2.25MB", 2250000},
		{" 10 b ", 10}, {"1.0005 kB", 1001}, {"1.5", 2}, {"0.5 B", 1}, {"7 EiB", 8070450532247928832},
	} {
		if got, err := ParseBytes(c.in); err != nil || got != c.want {
			t.Errorf("ParseBytes(%q) = %d, %v; want %d", c.in, got, err, c.want)
		}
	}
	for _, s := range []string{"", "abc", "1 KB B", "1.5.2 MB", "-1 kB", "1 kbit", "1e3 B", "9 EiB", ".5 kB"} {
		if got, err := ParseBytes(s); err == nil {
			t.Errorf("ParseBytes(%q) = %d, want error", s, got)
		}
	}
}

func TestFormatDuration(t *testing.T) {
	for _, c := range []struct {
		ms   int64
		want string
	}{
		{0, "0ms"}, {850, "850ms"}, {1000, "1s"}, {45000, "45s"}, {65000, "1m 5s"}, {3600000, "1h"},
		{3725000, "1h 2m"}, {90061000, "1d 1h"}, {172800000, "2d"}, {59999, "59s"},
	} {
		if got, err := FormatDuration(c.ms); err != nil || got != c.want {
			t.Errorf("FormatDuration(%d) = %q, %v; want %q", c.ms, got, err, c.want)
		}
	}
	if _, err := FormatDuration(-1); err == nil {
		t.Error("FormatDuration(-1) want error")
	}
}

func TestRelativeTime(t *testing.T) {
	for _, c := range []struct {
		d    int64
		want string
	}{
		{0, "just now"}, {30, "just now"}, {-44, "just now"}, {45, "in a minute"}, {-89, "a minute ago"},
		{90, "in 2 minutes"}, {150, "in 3 minutes"}, {-2670, "45 minutes ago"}, {2700, "in an hour"},
		{5399, "in an hour"}, {5400, "in 2 hours"}, {-75600, "21 hours ago"}, {79200, "in a day"},
		{129599, "in a day"}, {129600, "in 2 days"}, {2246400, "in a month"}, {-3974400, "2 months ago"},
		{15552000, "in 6 months"}, {27648000, "in a year"}, {-47347200, "2 years ago"}, {63115200, "in 2 years"},
		{315569520, "in 10 years"},
	} {
		if got := RelativeTime(c.d); got != c.want {
			t.Errorf("RelativeTime(%d) = %q, want %q", c.d, got, c.want)
		}
	}
}
