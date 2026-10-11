// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package shellquote

import (
	"errors"
	"reflect"
	"testing"
)

func TestShellQuote(t *testing.T) {
	for _, c := range [][2]string{
		{"", "''"},
		{"abc", "abc"},
		{"a b", "'a b'"},
		{"it's", "'it'\\''s'"},
		{"a\"b", "'a\"b'"},
		{"$HOME", "'$HOME'"},
		{"*.txt", "'*.txt'"},
		{"x=1", "x=1"},
		{"path/to/file.txt", "path/to/file.txt"},
		{"tab\there", "'tab\there'"},
		{"line\nbreak", "'line\nbreak'"},
		{"\u00e9", "'\u00e9'"},
		{"-n", "-n"},
		{"~user", "'~user'"},
		{"!bang", "'!bang'"},
		{"''", "''\\'''\\'''"},
	} {
		if got := ShellQuote(c[0]); got != c[1] {
			t.Errorf("ShellQuote(%q) = %q; want %q", c[0], got, c[1])
		}
	}
}

func TestShellJoin(t *testing.T) {
	if got := ShellJoin([]string{"ls", "-la", "my file", "it's"}); got != "ls -la 'my file' 'it'\\''s'" {
		t.Errorf("ShellJoin = %q", got)
	}
	if got := ShellJoin([]string{}); got != "" {
		t.Errorf("ShellJoin = %q", got)
	}
}

func TestShellSplit(t *testing.T) {
	for _, c := range []struct {
		line string
		want []string
	}{
		{"a b  c", []string{"a", "b", "c"}},
		{"'a b' c", []string{"a b", "c"}},
		{"\"a b\" c", []string{"a b", "c"}},
		{"a\\ b", []string{"a b"}},
		{"\"say \\\"hi\\\"\"", []string{"say \"hi\""}},
		{"\"keep \\n and \\x\"", []string{"keep \\n and \\x"}},
		{"'no \\escape'", []string{"no \\escape"}},
		{"x\"y\"'z'w", []string{"xyzw"}},
		{"'' \"\"", []string{"", ""}},
		{"a\tb\nc", []string{"a", "b", "c"}},
		{"echo $HOME *.txt ~", []string{"echo", "$HOME", "*.txt", "~"}},
		{"\"a\\\nb\"", []string{"ab"}},
		{"a\\\nb", []string{"ab"}},
		{"# comment", []string{}},
		{"cmd # trailing comment", []string{"cmd"}},
		{"a#b", []string{"a#b"}},
		{"\"$x\"", []string{"$x"}},
		{"  lead  trail  ", []string{"lead", "trail"}},
	} {
		if got, err := ShellSplit(c.line); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("ShellSplit(%q) = %q, %v; want %q", c.line, got, err, c.want)
		}
	}
	for _, line := range []string{"'open", "\"open", "trail\\", "\"bad \\"} {
		if _, err := ShellSplit(line); !errors.Is(err, ErrSplit) {
			t.Errorf("ShellSplit(%q) should fail", line)
		}
	}
}

func TestShellRoundTrip(t *testing.T) {
	args := []string{"", "abc", "a b", "it's", "a\"b", "$HOME", "*.txt", "x=1", "path/to/file.txt", "tab\there", "line\nbreak", "\u00e9", "-n", "~user", "!bang", "''"}
	for _, a := range args {
		if got, err := ShellSplit(ShellQuote(a)); err != nil || !reflect.DeepEqual(got, []string{a}) {
			t.Errorf("round trip %q = %q, %v", a, got, err)
		}
	}
	if got, err := ShellSplit(ShellJoin(args)); err != nil || !reflect.DeepEqual(got, args) {
		t.Errorf("join round trip = %q, %v", got, err)
	}
}
