// SPDX-License-Identifier: Apache-2.0

package colorconv

import (
	"math"
	"testing"
)

func near3(t *testing.T, label string, got, want [3]float64) {
	t.Helper()
	for i := range got {
		if math.Abs(got[i]-want[i]) > 1e-6 {
			t.Errorf("%s = %v, want %v", label, got, want)
			return
		}
	}
}

func TestHex(t *testing.T) {
	for _, c := range []struct {
		text string
		rgba [4]float64
		hex  string
	}{
		{"#000", [4]float64{0.0, 0.0, 0.0, 1.0}, "#000000"},
		{"#fff", [4]float64{1.0, 1.0, 1.0, 1.0}, "#ffffff"},
		{"#f00", [4]float64{1.0, 0.0, 0.0, 1.0}, "#ff0000"},
		{"#0f8", [4]float64{0.0, 1.0, 0.5333333333333333, 1.0}, "#00ff88"},
		{"#336699", [4]float64{0.2, 0.4, 0.6, 1.0}, "#336699"},
		{"#336699cc", [4]float64{0.2, 0.4, 0.6, 0.8}, "#336699cc"},
		{"#ABCDEF", [4]float64{0.6705882352941176, 0.803921568627451, 0.9372549019607843, 1.0}, "#abcdef"},
		{"#12345678", [4]float64{0.07058823529411765, 0.20392156862745098, 0.33725490196078434, 0.47058823529411764}, "#12345678"},
		{"#7f7f7f", [4]float64{0.4980392156862745, 0.4980392156862745, 0.4980392156862745, 1.0}, "#7f7f7f"},
		{"#808080", [4]float64{0.5019607843137255, 0.5019607843137255, 0.5019607843137255, 1.0}, "#808080"},
	} {
		r, g, b, a, err := ParseHex(c.text)
		if err != nil {
			t.Fatal(err)
		}
		near3(t, c.text, [3]float64{r, g, b}, [3]float64{c.rgba[0], c.rgba[1], c.rgba[2]})
		if math.Abs(a-c.rgba[3]) > 1e-6 {
			t.Errorf("%s alpha = %v", c.text, a)
		}
		if got := ToHex(r, g, b, a); got != c.hex {
			t.Errorf("ToHex(%s) = %s, want %s", c.text, got, c.hex)
		}
	}
	for _, s := range []string{"336699", "#12", "#12345", "#1234567", "#ggg", "#", "rgb(1,2,3)", "#3366999"} {
		if _, _, _, _, err := ParseHex(s); err == nil {
			t.Errorf("ParseHex(%q) should fail", s)
		}
	}
}

func TestToHex(t *testing.T) {
	for _, c := range []struct {
		v    []float64
		want string
	}{
		{[]float64{0.5, 0.5, 0.5}, "#808080"},
		{[]float64{1.2, -0.1, 0.5}, "#ff0080"},
		{[]float64{0.001, 0.999, 0.5}, "#00ff80"},
		{[]float64{0.2, 0.4, 0.6, 0.5}, "#33669980"},
		{[]float64{0.2, 0.4, 0.6, 1.0}, "#336699"},
		{[]float64{0.00196078431372549, 0.0058823529411764705, 0.00980392156862745}, "#010203"},
	} {
		a := 1.0
		if len(c.v) == 4 {
			a = c.v[3]
		}
		if got := ToHex(c.v[0], c.v[1], c.v[2], a); got != c.want {
			t.Errorf("ToHex(%v) = %s, want %s", c.v, got, c.want)
		}
	}
}

func TestHSL(t *testing.T) {
	for _, c := range []struct {
		hex  string
		want [3]float64
	}{
		{"#000", [3]float64{0.0, 0.0, 0.0}},
		{"#fff", [3]float64{0.0, 0.0, 1.0}},
		{"#f00", [3]float64{0.0, 1.0, 0.5}},
		{"#0f0", [3]float64{120.0, 1.0, 0.5}},
		{"#00f", [3]float64{240.0, 1.0, 0.5}},
		{"#336699", [3]float64{210.0, 0.49999999999999994, 0.4}},
		{"#ff8000", [3]float64{30.11764705882353, 1.0, 0.5}},
		{"#808080", [3]float64{0.0, 0.0, 0.5019607843137255}},
		{"#c0ffee", [3]float64{163.80952380952382, 1.0, 0.8764705882352941}},
	} {
		r, g, b, _, _ := ParseHex(c.hex)
		h, s, l := RGBToHSL(r, g, b)
		near3(t, "RGBToHSL "+c.hex, [3]float64{h, s, l}, c.want)
	}
	for _, c := range []struct{ in, want [3]float64 }{
		{[3]float64{0.0, 1.0, 0.5}, [3]float64{1.0, 0.0, 0.0}},
		{[3]float64{120.0, 1.0, 0.5}, [3]float64{0.0, 1.0, 0.0}},
		{[3]float64{240.0, 1.0, 0.5}, [3]float64{0.0, 0.0, 1.0}},
		{[3]float64{210.0, 0.5, 0.4}, [3]float64{0.2, 0.4, 0.6000000000000001}},
		{[3]float64{360.0, 1.0, 0.5}, [3]float64{1.0, 0.0, 0.0}},
		{[3]float64{-30.0, 1.0, 0.5}, [3]float64{1.0, 0.0, 0.5}},
		{[3]float64{90.0, 0.0, 0.3}, [3]float64{0.3, 0.3, 0.3}},
		{[3]float64{30.0, 1.0, 0.75}, [3]float64{1.0, 0.75, 0.5}},
	} {
		r, g, b := HSLToRGB(c.in[0], c.in[1], c.in[2])
		near3(t, "HSLToRGB", [3]float64{r, g, b}, c.want)
	}
}

func TestOKLCH(t *testing.T) {
	for _, c := range []struct {
		hex  string
		want [3]float64
	}{
		{"#000", [3]float64{0.0, 0.0, 0.0}},
		{"#fff", [3]float64{0.9999999934735462, 3.727399553519285e-08, 0.0}},
		{"#f00", [3]float64{0.6279553606145516, 0.2576833077361567, 29.233885192342633}},
		{"#0f0", [3]float64{0.8664396115356694, 0.2948272403370166, 142.49533888780996}},
		{"#00f", [3]float64{0.4520137183853429, 0.31321437166460114, 264.052020638055}},
		{"#336699", [3]float64{0.49931445292373877, 0.09866435965710138, 250.43305370947127}},
		{"#808080", [3]float64{0.5998708017071177, 2.2359581629199253e-08, 0.0}},
		{"#ff8000", [3]float64{0.7318948427227374, 0.1858032156306402, 52.984679593971286}},
	} {
		r, g, b, _, _ := ParseHex(c.hex)
		l, ch, h := RGBToOKLCH(r, g, b)
		near3(t, "RGBToOKLCH "+c.hex, [3]float64{l, ch, h}, c.want)
	}
	for _, c := range []struct{ in, want [3]float64 }{
		{[3]float64{0.627955, 0.257683, 29.2339}, [3]float64{0.9999989995226538, 2.4989239385060646e-06, -3.5938127559420605e-08}},
		{[3]float64{0.7, 0.1, 200.0}, [3]float64{0.25183094033414793, 0.6942495954401551, 0.7170636897415913}},
		{[3]float64{0.5, 0.4, 150.0}, [3]float64{-2.5595884674002214, 0.5687880047974224, -0.8622713129274896}},
		{[3]float64{1.0, 0.0, 0.0}, [3]float64{0.9999999999999999, 0.9999999999999999, 0.9999999999999999}},
		{[3]float64{0.0, 0.0, 0.0}, [3]float64{0.0, 0.0, 0.0}},
	} {
		r, g, b := OKLCHToRGB(c.in[0], c.in[1], c.in[2])
		near3(t, "OKLCHToRGB", [3]float64{r, g, b}, c.want)
	}
	if InGamut(0.25183094033414793, 0.6942495954401551, 0.7170636897415913) != true {
		t.Error("InGamut True")
	}
	if InGamut(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896) != false {
		t.Error("InGamut False")
	}
}
