// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package numwords

import (
	"errors"
	"testing"
)

func TestNumberToWords(t *testing.T) {
	for _, c := range []struct {
		n    int64
		want string
	}{
		{0, "zero"},
		{1, "one"},
		{7, "seven"},
		{10, "ten"},
		{11, "eleven"},
		{13, "thirteen"},
		{19, "nineteen"},
		{20, "twenty"},
		{21, "twenty-one"},
		{42, "forty-two"},
		{99, "ninety-nine"},
		{100, "one hundred"},
		{101, "one hundred one"},
		{110, "one hundred ten"},
		{115, "one hundred fifteen"},
		{999, "nine hundred ninety-nine"},
		{1000, "one thousand"},
		{1001, "one thousand one"},
		{1010, "one thousand ten"},
		{1100, "one thousand one hundred"},
		{2024, "two thousand twenty-four"},
		{12345, "twelve thousand three hundred forty-five"},
		{100000, "one hundred thousand"},
		{999999, "nine hundred ninety-nine thousand nine hundred ninety-nine"},
		{1000000, "one million"},
		{1000001, "one million one"},
		{1234567, "one million two hundred thirty-four thousand five hundred sixty-seven"},
		{1000000000, "one billion"},
		{1002003004, "one billion two million three thousand four"},
		{999999999999999, "nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine"},
		{-1, "negative one"},
		{-42, "negative forty-two"},
		{-1000000, "negative one million"},
	} {
		if got, err := NumberToWords(c.n); err != nil || got != c.want {
			t.Errorf("NumberToWords(%d) = %q, %v; want %q", c.n, got, err, c.want)
		}
	}
	for _, n := range []int64{1000000000000000, -1000000000000000} {
		if _, err := NumberToWords(n); !errors.Is(err, ErrRange) {
			t.Errorf("NumberToWords(%d) should fail", n)
		}
	}
}

func TestOrdinalWords(t *testing.T) {
	for _, c := range []struct {
		n    int64
		want string
	}{
		{0, "zeroth"},
		{1, "first"},
		{2, "second"},
		{3, "third"},
		{4, "fourth"},
		{5, "fifth"},
		{8, "eighth"},
		{9, "ninth"},
		{11, "eleventh"},
		{12, "twelfth"},
		{20, "twentieth"},
		{21, "twenty-first"},
		{22, "twenty-second"},
		{23, "twenty-third"},
		{30, "thirtieth"},
		{40, "fortieth"},
		{99, "ninety-ninth"},
		{100, "one hundredth"},
		{101, "one hundred first"},
		{102, "one hundred second"},
		{111, "one hundred eleventh"},
		{112, "one hundred twelfth"},
		{1000, "one thousandth"},
		{1001, "one thousand first"},
		{1000000, "one millionth"},
		{2023, "two thousand twenty-third"},
	} {
		if got, err := OrdinalWords(c.n); err != nil || got != c.want {
			t.Errorf("OrdinalWords(%d) = %q, %v; want %q", c.n, got, err, c.want)
		}
	}
	for _, n := range []int64{-1} {
		if _, err := OrdinalWords(n); !errors.Is(err, ErrRange) {
			t.Errorf("OrdinalWords(%d) should fail", n)
		}
	}
}

func TestOrdinalSuffix(t *testing.T) {
	for _, c := range []struct {
		n    int64
		want string
	}{
		{0, "0th"},
		{1, "1st"},
		{2, "2nd"},
		{3, "3rd"},
		{4, "4th"},
		{11, "11th"},
		{12, "12th"},
		{13, "13th"},
		{14, "14th"},
		{21, "21st"},
		{22, "22nd"},
		{23, "23rd"},
		{101, "101st"},
		{111, "111th"},
		{112, "112th"},
		{113, "113th"},
		{1001, "1001st"},
		{-1, "-1st"},
		{-11, "-11th"},
		{-22, "-22nd"},
	} {
		if got := OrdinalSuffix(c.n); got != c.want {
			t.Errorf("OrdinalSuffix(%d) = %q; want %q", c.n, got, c.want)
		}
	}
}

func TestMoneyWords(t *testing.T) {
	for _, c := range []struct {
		minor              int64
		major, minorName   string
		exponent           int
		want               string
	}{
		{12345, "dollar", "cent", 2, "one hundred twenty-three dollars and forty-five cents"},
		{100, "dollar", "cent", 2, "one dollar"},
		{1, "dollar", "cent", 2, "zero dollars and one cent"},
		{101, "euro", "cent", 2, "one euro and one cent"},
		{0, "dollar", "cent", 2, "zero dollars"},
		{500, "yen", "sen", 0, "five hundred yens"},
		{1001, "dinar", "fils", 3, "one dinar and one fils"},
		{199, "pound", "penny", 2, "one pound and ninety-nine pennys"},
	} {
		if got, err := MoneyWords(c.minor, c.major, c.minorName, c.exponent); err != nil || got != c.want {
			t.Errorf("MoneyWords(%d) = %q, %v; want %q", c.minor, got, err, c.want)
		}
	}
	if _, err := MoneyWords(-1, "dollar", "cent", 2); err == nil {
		t.Error("negative amount should fail")
	}
	if _, err := MoneyWords(1, "dollar", "cent", 4); err == nil {
		t.Error("exponent 4 should fail")
	}
}
