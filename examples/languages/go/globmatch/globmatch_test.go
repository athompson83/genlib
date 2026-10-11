// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package globmatch

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestMatch(t *testing.T) {
	for _, c := range []struct {
		pattern, path string
		dot, want     bool
	}{
		{"*.js", "a.js", false, true},
		{"*.js", "a/b.js", false, false},
		{"**/*.js", "a/b/c.js", false, true},
		{"**/*.js", "c.js", false, true},
		{"src/**", "src", false, true},
		{"src/**", "src/a/b.ts", false, true},
		{"src/**/test/*.py", "src/test/x.py", false, true},
		{"src/**/test/*.py", "src/a/b/test/x.py", false, true},
		{"a?c", "abc", false, true},
		{"a?c", "a/c", false, false},
		{"[a-c]x", "bx", false, true},
		{"[!a-c]x", "bx", false, false},
		{"[!a-c]x", "dx", false, true},
		{"[^0-9]", "x", false, true},
		{"[]a]", "a", false, true},
		{"[]a]", "]", false, true},
		{"*.{js,ts}", "x.ts", false, true},
		{"*.{js,ts}", "x.tsx", false, false},
		{"{src,lib}/**/*.go", "lib/x/y.go", false, true},
		{".*", ".env", false, true},
		{"*", ".env", false, false},
		{"*", ".env", true, true},
		{"**/x", ".git/x", false, false},
		{"**/x", ".git/x", true, true},
		{"a\\*b", "a*b", false, true},
		{"a\\*b", "axb", false, false},
		{"*", "", false, true},
		{"**", "a/b/c", false, true},
		{"a/**/b", "a/b", false, true},
		{"a/**/b", "a/x/y/b", false, true},
		{"*.txt", "notes.TXT", false, false},
		{"[a-z]*.md", "Readme.md", false, false},
		{"docs/*", "docs/a/b", false, false},
		{"?", "\u00e9", false, true},
	} {
		got, err := Match(c.pattern, c.path, c.dot)
		if err != nil || got != c.want {
			t.Errorf("Match(%q, %q, %v) = %v, %v; want %v", c.pattern, c.path, c.dot, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, p := range []string{"[abc", "{a,b", "a{b{c}}", "", "x\\"} {
		if _, err := Match(p, "x", false); !errors.Is(err, ErrPattern) {
			t.Errorf("Match(%q) error = %v, want ErrPattern", p, err)
		}
	}
}

func TestFilter(t *testing.T) {
	got, err := Filter("src/**/*.go", []string{"src/a.go", "src/x/b.go", "lib/c.go", "src/.hidden/d.go", "src/e.txt"}, false)
	if err != nil || !reflect.DeepEqual(got, []string{"src/a.go", "src/x/b.go"}) {
		t.Errorf("Filter = %q, %v", got, err)
	}
	if _, err := Filter("[", []string{"a"}, false); err == nil {
		t.Error("Filter accepted an invalid pattern")
	}
}

func TestNoBlowup(t *testing.T) {
	path := strings.Repeat("a/", 30) + "b"
	if ok, _ := Match(strings.Repeat("**/", 12)+"c", path, false); ok {
		t.Error("unexpected match")
	}
	if ok, _ := Match(strings.Repeat("*a", 20)+"b", strings.Repeat("a", 60), false); ok {
		t.Error("unexpected match")
	}
}
