// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 10 capability vectors; DO NOT EDIT by hand.

package dotenv

import (
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	for _, c := range []struct {
		text string
		want []Entry
	}{
		{"A=1\nB=two\n", []Entry{{"A", "1"}, {"B", "two"}}},
		{"# c\n\nexport KEY = value with spaces  # comment\n", []Entry{{"KEY", "value with spaces"}}},
		{"Q=\"a\\nb\\t\\\"c\\\" \\\\ \\$HOME\"\n", []Entry{{"Q", "a\nb\t\"c\" \\ $HOME"}}},
		{"S='raw ${X} \\n'\n", []Entry{{"S", "raw ${X} \\n"}}},
		{"M=\"line1\nline2\"\nN=after\n", []Entry{{"M", "line1\nline2"}, {"N", "after"}}},
		{"E=\nF= \n", []Entry{{"E", ""}, {"F", ""}}},
		{"DUP=1\nDUP=2\n", []Entry{{"DUP", "2"}}},
		{"URL=https://x.test/#frag\n", []Entry{{"URL", "https://x.test/#frag"}}},
		{"H=a#b\n", []Entry{{"H", "a#b"}}},
		{"K.x_y=1\n", []Entry{{"K.x_y", "1"}}},
		{"W=\"x\" # trailing ok\n", []Entry{{"W", "x"}}},
		{"CRLF=1\r\nNEXT=2\r\n", []Entry{{"CRLF", "1"}, {"NEXT", "2"}}},
	} {
		got, err := Parse(c.text, false, nil)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q) = %q, %v; want %q", c.text, got, err, c.want)
		}
	}
}

func TestExpand(t *testing.T) {
	for _, c := range []struct {
		text string
		vars map[string]string
		want []Entry
	}{
		{"A=1\nB=${A}-x\n", map[string]string{}, []Entry{{"A", "1"}, {"B", "1-x"}}},
		{"B=${A}\nA=1\n", map[string]string{"A": "env"}, []Entry{{"B", "env"}, {"A", "1"}}},
		{"P=${MISSING:-fallback}\nQ=${EMPTY:-d}\n", map[string]string{"EMPTY": ""}, []Entry{{"P", "fallback"}, {"Q", "d"}}},
		{"S='${A}'\nT=\"${A}\"\nU=\"\\${A}\"\n", map[string]string{"A": "v"}, []Entry{{"S", "${A}"}, {"T", "v"}, {"U", "${A}"}}},
	} {
		got, err := Parse(c.text, true, c.vars)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("Parse(%q, expand) = %q, %v; want %q", c.text, got, err, c.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, text := range []string{"NOEQUALS\n", "1BAD=x\n", "A='unterminated\n", "A=\"never closed\nB=1\n", "A=\"x\" junk\n", "-K=v\n"} {
		_, err := Parse(text, false, nil)
		var e *Error
		if !errors.As(err, &e) || e.Line != 1 {
			t.Errorf("Parse(%q) error = %v, want a line-1 *Error", text, err)
		}
	}
	_, err := Parse("A=1\n\nB='x\n", false, nil)
	if e, ok := err.(*Error); !ok || e.Line != 3 || !strings.Contains(e.Error(), "line 3") {
		t.Errorf("line number = %v", err)
	}
}
