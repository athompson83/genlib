// SPDX-License-Identifier: Apache-2.0

package checkdigits

import "testing"

type boolCase struct {
	in   string
	want bool
}

func runBool(t *testing.T, name string, f func(string) bool, cases []boolCase) {
	t.Helper()
	for _, c := range cases {
		if got := f(c.in); got != c.want {
			t.Errorf("%s(%q) = %v, want %v", name, c.in, got, c.want)
		}
	}
}

func TestLuhn(t *testing.T) {
	runBool(t, "LuhnValid", LuhnValid, []boolCase{
		{"4539 1488 0343 6467", true}, {"79927398713", true}, {"79927398710", false}, {"0", false},
		{"4539-1488-0343-6468", false}, {"12a4", false}, {"", false},
	})
	for _, c := range [][2]string{{"7992739871", "3"}, {"453914880343646", "7"}} {
		if got, err := LuhnCheckDigit(c[0]); err != nil || got != c[1] {
			t.Errorf("LuhnCheckDigit(%q) = %q, %v", c[0], got, err)
		}
	}
	for _, bad := range []string{"", "12a"} {
		if _, err := LuhnCheckDigit(bad); err == nil {
			t.Errorf("LuhnCheckDigit(%q) accepted", bad)
		}
	}
}

func TestIban(t *testing.T) {
	runBool(t, "IbanValid", IbanValid, []boolCase{
		{"GB82 WEST 1234 5698 7654 32", true}, {"DE89 3704 0044 0532 0130 00", true}, {"gb82west12345698765432", true},
		{"GB82 WEST 1234 5698 7654 33", false}, {"GB82-WEST", false}, {"NO9386011117947", true}, {"XX00", false},
	})
	for _, c := range [][2]string{{"gb82west12345698765432", "GB82 WEST 1234 5698 7654 32"}, {"NO9386011117947", "NO93 8601 1117 947"}} {
		if got, err := IbanFormat(c[0]); err != nil || got != c[1] {
			t.Errorf("IbanFormat(%q) = %q, %v", c[0], got, err)
		}
	}
	if _, err := IbanFormat("GB82 WEST 1234 5698 7654 33"); err == nil {
		t.Error("IbanFormat accepted an invalid IBAN")
	}
}

func TestGtinIsbn(t *testing.T) {
	runBool(t, "GtinValid", GtinValid, []boolCase{
		{"4006381333931", true}, {"036000291452", true}, {"96385074", true}, {"10614141000415", true},
		{"4006381333932", false}, {"12345", false},
	})
	runBool(t, "Isbn10Valid", Isbn10Valid, []boolCase{
		{"0-306-40615-2", true}, {"0-8044-2957-X", true}, {"0-306-40615-3", false}, {"030640615", false},
	})
	runBool(t, "Isbn13Valid", Isbn13Valid, []boolCase{
		{"978-0-306-40615-7", true}, {"979-10-90636-07-1", true}, {"978-0-306-40615-8", false}, {"4006381333931", false},
	})
	for _, c := range [][2]string{{"0-306-40615-2", "9780306406157"}, {"080442957X", "9780804429573"}} {
		if got, err := Isbn10To13(c[0]); err != nil || got != c[1] {
			t.Errorf("Isbn10To13(%q) = %q, %v", c[0], got, err)
		}
	}
	if _, err := Isbn10To13("0-306-40615-3"); err == nil {
		t.Error("Isbn10To13 accepted an invalid ISBN")
	}
}
