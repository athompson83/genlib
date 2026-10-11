// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package ini

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func norm(s []Section) []Section {
	for i := range s {
		if s[i].Entries == nil {
			s[i].Entries = []Entry{}
		}
	}
	return s
}

func TestParse(t *testing.T) {
	for _, c := range []struct {
		text string
		want []Section
	}{
		{"a=1\nb = two\n", []Section{{"", []Entry{{"a", "1"}, {"b", "two"}}}}},
		{"[db]\nhost = localhost ; comment\nport: 5432\n", []Section{{"", []Entry{}}, {"db", []Entry{{"host", "localhost"}, {"port", "5432"}}}}},
		{"; c\n# c\n\n[s]\nk=\"quoted \\\"x\\\" \\\\ ;#\"\n", []Section{{"", []Entry{}}, {"s", []Entry{{"k", "quoted \"x\" \\ ;#"}}}}},
		{"[s]\nflag\nx = a#b\ny = a #b\n", []Section{{"", []Entry{}}, {"s", []Entry{{"flag", ""}, {"x", "a#b"}, {"y", "a"}}}}},
		{"[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n", []Section{{"", []Entry{}}, {"a", []Entry{{"k", "3"}, {"j", "4"}}}, {"b", []Entry{{"k", "2"}}}}},
		{"k: v = w\n", []Section{{"", []Entry{{"k", "v = w"}}}}},
		{"[ spaced name ]\nK=V\r\nk2=v2\r\n", []Section{{"", []Entry{}}, {"spaced name", []Entry{{"K", "V"}, {"k2", "v2"}}}}},
		{"", []Section{{"", []Entry{}}}},
	} {
		got, err := Parse(c.text)
		if err != nil || !reflect.DeepEqual(norm(got), c.want) {
			t.Errorf("Parse(%q) = %#v, %v; want %#v", c.text, got, err, c.want)
		}
	}
}

func TestStringify(t *testing.T) {
	for _, c := range []struct {
		data []Section
		want string
	}{
		{[]Section{{"", []Entry{{"a", "1"}}}, {"s", []Entry{{"k", "v"}, {"e", ""}, {"sp", " x"}, {"q", "a\"b;c"}}}}, "a = 1\n\n[s]\nk = v\ne = \"\"\nsp = \" x\"\nq = \"a\\\"b;c\"\n"},
		{[]Section{{"", []Entry{}}, {"only", []Entry{{"x", "y"}}}}, "[only]\nx = y\n"},
		{[]Section{{"", []Entry{}}}, ""},
	} {
		if got := Stringify(c.data); got != c.want {
			t.Errorf("Stringify(%#v) = %q; want %q", c.data, got, c.want)
		}
		back, err := Parse(c.want)
		if err != nil || Stringify(back) != c.want {
			t.Errorf("round trip of %q failed: %v", c.want, err)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, s := range []string{"[unterminated\n", "[]\n", "=v\n", "k=\"open\n", "[a]]\n"} {
		if _, err := Parse(s); !errors.Is(err, ErrIni) || !strings.Contains(err.Error(), "line 1:") {
			t.Errorf("Parse(%q) error = %v", s, err)
		}
	}
}
