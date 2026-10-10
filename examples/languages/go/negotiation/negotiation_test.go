// SPDX-License-Identifier: Apache-2.0

package negotiation

import "testing"

func TestMediaType(t *testing.T) {
	available := []string{"application/json", "text/html", "text/csv"}
	for _, c := range [][2]string{
		{"application/json", "application/json"},
		{"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "text/html"},
		{"text/*;q=0.5, application/json;q=0.4", "text/html"},
		{"*/*", "application/json"},
		{"text/csv;q=0, text/*", "text/html"},
		{"image/png", ""},
		{"application/json;q=0", ""},
		{"TEXT/HTML", "text/html"},
		{"text/html;q=1.5, text/csv", "text/csv"},
		{"", "application/json"}, // absent header (JSON null)
		{"", "application/json"}, // empty header
		{"application/*;q=0.2, */*;q=0.1", "application/json"},
		{"text/html;level=1;q=0.7, text/csv;q=0.7", "text/html"},
	} {
		got, ok := NegotiateMediaType(c[0], available)
		if got != c[1] || ok != (c[1] != "") {
			t.Errorf("NegotiateMediaType(%q) = %q, %v; want %q", c[0], got, ok, c[1])
		}
	}
}

func TestLanguage(t *testing.T) {
	available := []string{"en", "en-GB", "fr", "pt-BR"}
	for _, c := range [][2]string{
		{"fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5", "fr"},
		{"en-GB", "en-GB"},
		{"en-US,en;q=0.9", "en"},
		{"pt", "pt-BR"},
		{"de", ""},
		{"de, *;q=0.1", "en"},
		{"en;q=0, *", "fr"},
		{"PT-br", "pt-BR"},
		{"", "en"}, // absent header
		{"zh-Hant-TW", ""},
	} {
		got, ok := NegotiateLanguage(c[0], available)
		if got != c[1] || ok != (c[1] != "") {
			t.Errorf("NegotiateLanguage(%q) = %q, %v; want %q", c[0], got, ok, c[1])
		}
	}
}

func TestQValues(t *testing.T) {
	for _, c := range []struct {
		v  string
		ok bool
		q  float64
	}{{"0", true, 0}, {"0.", true, 0}, {"0.125", true, 0.125}, {"1.000", true, 1}, {"1.001", false, 0}, {"0.1234", false, 0}, {".5", false, 0}, {"", false, 0}} {
		if validQ(c.v) != c.ok || (c.ok && qValue(c.v) != c.q) {
			t.Errorf("q %q", c.v)
		}
	}
}
