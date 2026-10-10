// SPDX-License-Identifier: Apache-2.0

// Package contrast computes WCAG 2.x relative luminance, contrast ratios and
// AA/AAA checks for hex colors.
package contrast

import (
	"errors"
	"math"
	"regexp"
	"strconv"
)

var hexColor = regexp.MustCompile(`^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`)

func channel(v uint64) float64 {
	c := float64(v) / 255
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

// RelativeLuminance returns the luminance of "#rgb" or "#rrggbb" (case-insensitive).
func RelativeLuminance(hex string) (float64, error) {
	m := hexColor.FindStringSubmatch(hex)
	if m == nil {
		return 0, errors.New("contrast: color must be #rgb or #rrggbb")
	}
	d := m[1]
	if len(d) == 3 {
		d = string([]byte{d[0], d[0], d[1], d[1], d[2], d[2]})
	}
	var c [3]float64
	for i := 0; i < 3; i++ {
		v, _ := strconv.ParseUint(d[2*i:2*i+2], 16, 8)
		c[i] = channel(v)
	}
	return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2], nil
}

// Ratio returns (Lmax + 0.05) / (Lmin + 0.05), from 1 to 21.
func Ratio(a, b string) (float64, error) {
	la, err := RelativeLuminance(a)
	if err != nil {
		return 0, err
	}
	lb, err := RelativeLuminance(b)
	if err != nil {
		return 0, err
	}
	return (math.Max(la, lb) + 0.05) / (math.Min(la, lb) + 0.05), nil
}

// Ratio2 returns Ratio rounded to 2 decimals, half away from zero (for display).
func Ratio2(a, b string) (float64, error) {
	r, err := Ratio(a, b)
	if err != nil {
		return 0, err
	}
	return math.Round(r*100) / 100, nil
}

// Passes compares the unrounded ratio with AA 4.5 (large 3.0) or AAA 7.0 (large 4.5).
func Passes(ratio float64, level string, largeText bool) (bool, error) {
	var need float64
	switch {
	case level == "AA" && !largeText:
		need = 4.5
	case level == "AA":
		need = 3.0
	case level == "AAA" && !largeText:
		need = 7.0
	case level == "AAA":
		need = 4.5
	default:
		return false, errors.New(`contrast: level must be "AA" or "AAA"`)
	}
	return ratio >= need, nil
}
