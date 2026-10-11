// SPDX-License-Identifier: Apache-2.0

// Package colorconv converts colors between CSS hex, sRGB, HSL and OKLCH
// (Björn Ottosson's Oklab, 2020). Channels r, g, b and alpha are 0..1 floats;
// HSL h is degrees [0, 360) with s and l in 0..1; OKLCH L is 0..1, C >= 0 and
// h is degrees.
package colorconv

import (
	"errors"
	"fmt"
	"math"
	"strconv"
)

func hexVal(c byte) bool {
	return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')
}

// ParseHex parses "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) into r, g, b, a in 0..1.
func ParseHex(text string) (r, g, b, a float64, err error) {
	h := ""
	if len(text) > 0 && text[0] == '#' {
		h = text[1:]
	}
	valid := len(h) == 3 || len(h) == 4 || len(h) == 6 || len(h) == 8
	for i := 0; valid && i < len(h); i++ {
		valid = hexVal(h[i])
	}
	if !valid {
		return 0, 0, 0, 0, errors.New("colorconv: expected #rgb, #rgba, #rrggbb or #rrggbbaa")
	}
	if len(h) <= 4 {
		d := make([]byte, 0, 8)
		for i := 0; i < len(h); i++ {
			d = append(d, h[i], h[i])
		}
		h = string(d)
	}
	v := make([]float64, 0, 4)
	for i := 0; i < len(h); i += 2 {
		n, _ := strconv.ParseUint(h[i:i+2], 16, 8)
		v = append(v, float64(n)/255)
	}
	if len(v) == 3 {
		v = append(v, 1)
	}
	return v[0], v[1], v[2], v[3], nil
}

func clamp01(v float64) float64 { return math.Min(1, math.Max(0, v)) }

func byteOf(v float64) int {
	return int(math.Min(255, math.Max(0, math.Floor(v*255+0.5))))
}

// ToHex returns lowercase #rrggbb, or #rrggbbaa when a < 1 (pass a = 1 for opaque); channels are clamped and rounded half up.
func ToHex(r, g, b, a float64) string {
	out := fmt.Sprintf("#%02x%02x%02x", byteOf(clamp01(r)), byteOf(clamp01(g)), byteOf(clamp01(b)))
	if a < 1 {
		out += fmt.Sprintf("%02x", byteOf(math.Max(0, a)))
	}
	return out
}

func floorMod(x, m float64) float64 {
	r := math.Mod(x, m)
	if r < 0 {
		r += m
	}
	return r
}

// RGBToHSL converts sRGB channels to HSL (h in degrees).
func RGBToHSL(r, g, b float64) (h, s, l float64) {
	mx, mn := math.Max(r, math.Max(g, b)), math.Min(r, math.Min(g, b))
	l = (mx + mn) / 2
	d := mx - mn
	if d == 0 {
		return 0, 0, l
	}
	s = d / (1 - math.Abs(2*l-1))
	switch mx {
	case r:
		h = floorMod((g-b)/d, 6)
	case g:
		h = (b-r)/d + 2
	default:
		h = (r-g)/d + 4
	}
	return floorMod(h*60, 360), s, l
}

// HSLToRGB converts HSL to sRGB channels; h wraps modulo 360.
func HSLToRGB(h, s, l float64) (r, g, b float64) {
	h = floorMod(h, 360)
	c := (1 - math.Abs(2*l-1)) * s
	x := c * (1 - math.Abs(floorMod(h/60, 2)-1))
	m := l - c/2
	switch int(math.Floor(h/60)) % 6 {
	case 0:
		r, g, b = c, x, 0
	case 1:
		r, g, b = x, c, 0
	case 2:
		r, g, b = 0, c, x
	case 3:
		r, g, b = 0, x, c
	case 4:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}
	return r + m, g + m, b + m
}

func lin(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

func gam(c float64) float64 {
	if c <= 0.0031308 {
		return 12.92 * c
	}
	return 1.055*math.Pow(c, 1/2.4) - 0.055
}

func cbrt(x float64) float64 { return math.Copysign(math.Pow(math.Abs(x), 1.0/3), x) }

// RGBToOKLCH converts sRGB channels to OKLCH (L, C, h in degrees; h is 0 when C <= 1e-7).
func RGBToOKLCH(r, g, b float64) (L, C, H float64) {
	r, g, b = lin(r), lin(g), lin(b)
	l := cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b)
	m := cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b)
	s := cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b)
	L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s
	A := 1.9779984951*l - 2.4285922050*m + 0.4505937099*s
	B := 0.0259040371*l + 0.7827717662*m - 0.8086757660*s
	C = math.Hypot(A, B)
	if C > 1e-7 {
		H = floorMod(math.Atan2(B, A)*(180/math.Pi), 360)
	}
	return L, C, H
}

// OKLCHToRGB converts OKLCH to sRGB channels, unclamped (values outside 0..1 are out of gamut).
func OKLCHToRGB(L, C, H float64) (r, g, b float64) {
	A, B := C*math.Cos(H*math.Pi/180), C*math.Sin(H*math.Pi/180)
	l := math.Pow(L+0.3963377774*A+0.2158037573*B, 3)
	m := math.Pow(L-0.1055613458*A-0.0638541728*B, 3)
	s := math.Pow(L-0.0894841775*A-1.2914855480*B, 3)
	r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
	g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
	b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
	return gam(r), gam(g), gam(b)
}

// InGamut reports whether every channel lies within 0..1 (with 1e-9 tolerance).
func InGamut(r, g, b float64) bool {
	for _, v := range []float64{r, g, b} {
		if v < -1e-9 || v > 1+1e-9 {
			return false
		}
	}
	return true
}
