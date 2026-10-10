// SPDX-License-Identifier: Apache-2.0

package vcard

import (
	"strings"
	"testing"
)

func TestBuild(t *testing.T) {
	for _, c := range []struct {
		in   Contact
		want string
	}{
		{Contact{
			FN:      "Ada Lovelace",
			N:       &Name{Family: "Lovelace", Given: "Ada", Prefix: "Countess"},
			Org:     "Analytical Engines, Ltd.",
			Title:   "Programmer",
			Emails:  []Typed{{"ada@example.com", "work"}},
			Phones:  []Typed{{"+44 20 7946 0000", "cell"}},
			Address: &Address{Type: "home", Street: "12 St. James's Sq", Locality: "London", PostalCode: "SW1Y 4LB", Country: "United Kingdom"},
			URLs:    []string{"https://example.com/ada"},
			Note:    "First line\nSecond; with, punctuation \\ backslash",
			UID:     "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a",
		}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n"},
		{Contact{FN: "Zoë Ångström"}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n"},
		{Contact{FN: "Long Note", Note: strings.Repeat("é", 60)}, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:" + strings.Repeat("é", 35) + "\r\n " + strings.Repeat("é", 25) + "\r\nEND:VCARD\r\n"},
	} {
		got, err := Build(c.in)
		if err != nil || got != c.want {
			t.Errorf("Build(%q) = %q, %v; want %q", c.in.FN, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, c := range []Contact{
		{FN: ""},
		{FN: "   "},
		{FN: "A", Emails: []Typed{{Value: "not an email"}}},
		{FN: "A", Phones: []Typed{{Value: "call me"}}},
		{FN: "A", URLs: []string{"javascript:alert(1)"}},
		{FN: "A", Emails: []Typed{{"a@b.c", "Work"}}},
		{FN: "Tab\there"},
	} {
		if got, err := Build(c); err == nil {
			t.Errorf("Build(%+v) = %q, want error", c, got)
		}
	}
}
