// SPDX-License-Identifier: Apache-2.0

package cookies

import (
	"reflect"
	"testing"
)

func s(v string) *string { return &v }
func i(v int64) *int64   { return &v }

func TestSerialize(t *testing.T) {
	for _, c := range []struct {
		name, value string
		o           Options
		want        string
	}{
		{"sid", "abc123", Options{Path: s("/"), Secure: true, HTTPOnly: true, SameSite: "Lax"}, "sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"},
		{"__Host-session", "x.y.z", Options{Path: s("/"), Secure: true, HTTPOnly: true, SameSite: "Strict", MaxAge: i(3600)}, "__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict"},
		{"theme", "dark", Options{MaxAge: i(0), Expires: i(1792567680), Domain: s("Example.COM"), Path: s("/app")}, "theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app"},
		{"embed", "1", Options{Secure: true, SameSite: "None", Partitioned: true}, "embed=1; Secure; SameSite=None; Partitioned"},
		{"empty", "", Options{}, "empty="},
	} {
		got, err := Serialize(c.name, c.value, c.o)
		if err != nil || got != c.want {
			t.Errorf("Serialize(%q) = %q, %v; want %q", c.name, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, c := range []struct {
		name, value string
		o           Options
	}{
		{"bad name", "v", Options{}},
		{"n", "a;b", Options{}},
		{"n", "a b", Options{}},
		{"n", `a"b`, Options{}},
		{"n", "v", Options{SameSite: "None"}},
		{"__Secure-x", "v", Options{}},
		{"__Host-x", "v", Options{Secure: true, Path: s("/a")}},
		{"__Host-x", "v", Options{Secure: true, Path: s("/"), Domain: s("example.com")}},
		{"n", "v", Options{Path: s("relative")}},
		{"n", "v", Options{SameSite: "lax"}},
		{"n", "v", Options{Partitioned: true}},
		{"n", "v", Options{MaxAge: i(-1)}},
		{"", "v", Options{}},
	} {
		if got, err := Serialize(c.name, c.value, c.o); err == nil {
			t.Errorf("Serialize(%q, %q, %+v) = %q, want error", c.name, c.value, c.o, got)
		}
	}
}

func TestParse(t *testing.T) {
	for _, c := range []struct {
		h    string
		want [][2]string
	}{
		{"sid=abc; theme=dark", [][2]string{{"sid", "abc"}, {"theme", "dark"}}},
		{` a = 1 ;b=2;; c="quoted value" ;flag;d==x`, [][2]string{{"a", "1"}, {"b", "2"}, {"c", "quoted value"}, {"d", "=x"}}},
		{"a=1; a=2", [][2]string{{"a", "1"}, {"a", "2"}}},
		{"", [][2]string{}},
	} {
		if got := ParseHeader(c.h); !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseHeader(%q) = %q", c.h, got)
		}
	}
}

func TestIMFFixdate(t *testing.T) {
	for unix, want := range map[int64]string{0: "Thu, 01 Jan 1970 00:00:00 GMT", -1: "Wed, 31 Dec 1969 23:59:59 GMT", 951782400: "Tue, 29 Feb 2000 00:00:00 GMT"} {
		if got := IMFFixdate(unix); got != want {
			t.Errorf("IMFFixdate(%d) = %q", unix, got)
		}
	}
}
