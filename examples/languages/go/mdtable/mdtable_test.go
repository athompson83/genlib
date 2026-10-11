// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package mdtable

import (
	"errors"
	"testing"
)

func TestMarkdownTable(t *testing.T) {
	for _, c := range []struct {
		headers []string
		rows    [][]string
		align   []string
		want    string
	}{
		{[]string{"Name", "Qty"}, [][]string{[]string{"Apple", "3"}, []string{"Kiwi", "12"}}, nil, "| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |"},
		{[]string{"a", "b", "c"}, [][]string{[]string{"1", "2", "3"}}, []string{"left", "right", "center"}, "| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |"},
		{[]string{"Pipe|col", "Text"}, [][]string{[]string{"a|b", "line1\nline2"}, []string{"back\\slash", "crlf\r\nx"}}, nil, "| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |"},
		{[]string{"x"}, [][]string{}, []string{"center"}, "|  x  |\n| :-: |"},
		{[]string{"Caf\u00e9", "\U0001f600"}, [][]string{[]string{"na\u00efve", "ok"}}, []string{"right", ""}, "|  Caf\u00e9 | \U0001f600   |\n| ----: | --- |\n| na\u00efve | ok  |"},
		{[]string{"wide"}, [][]string{[]string{"abcdefghij"}}, []string{"center"}, "|    wide    |\n| :--------: |\n| abcdefghij |"},
	} {
		if got, err := MarkdownTable(c.headers, c.rows, c.align); err != nil || got != c.want {
			t.Errorf("MarkdownTable(%q) = %q, %v; want %q", c.headers, got, err, c.want)
		}
	}
	for _, c := range []struct {
		headers []string
		rows    [][]string
		align   []string
	}{
		{[]string{}, [][]string{}, nil},
		{[]string{"a", "b"}, [][]string{[]string{"1"}}, nil},
		{[]string{"a"}, [][]string{[]string{"1"}}, []string{"middle"}},
	} {
		if _, err := MarkdownTable(c.headers, c.rows, c.align); !errors.Is(err, ErrTable) {
			t.Errorf("MarkdownTable(%q, %q, %q) should fail", c.headers, c.rows, c.align)
		}
	}
}
