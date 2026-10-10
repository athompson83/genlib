// SPDX-License-Identifier: Apache-2.0

package emailaddress

import "testing"

func TestValid(t *testing.T) {
	for _, c := range []struct {
		in   string
		want bool
	}{
		{"user@example.com", true},
		{"first.last+tag@sub.Example.CO.uk", true},
		{"o'brien@example.ie", true},
		{"a@b", true},
		{"user@-example.com", false},
		{"user@example-.com", false},
		{"user@exa_mple.com", false},
		{"user example@example.com", false},
		{"user@@example.com", false},
		{"@example.com", false},
		{"user@", false},
		{"user@example..com", false},
		{"user.@example.com", true},
		{"ünïcode@example.com", false},
		{"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@example.com", true},
		{"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@example.com", false},
		{"u@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", true},
		{"u@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", false},
		{"user@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com", false},
	} {
		if got := Valid(c.in); got != c.want {
			t.Errorf("Valid(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}

func TestNormalize(t *testing.T) {
	if got, err := Normalize("  Mixed.Case@Example.COM "); err != nil || got != "Mixed.Case@example.com" {
		t.Fatalf("Normalize = %q, %v", got, err)
	}
	if _, err := Normalize("user@@example.com"); err == nil {
		t.Fatal("invalid address accepted")
	}
}
