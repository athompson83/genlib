// SPDX-License-Identifier: Apache-2.0

// Package mdtable renders GitHub-flavored Markdown tables.
//
// Cells escape '\' and '|' and turn CRLF, CR and LF into <br>. Each column is
// as wide as its longest escaped cell in code points (at least 3); cells are
// padded with spaces according to the column alignment and the separator row
// carries the alignment colons. Lines have no trailing newline.
package mdtable

import (
	"errors"
	"strings"
)

// ErrTable is returned for empty headers, ragged rows or an unknown alignment.
var ErrTable = errors.New("mdtable: invalid table")

// Column alignments; AlignNone ("") renders a separator without colons.
const (
	AlignNone   = ""
	AlignLeft   = "left"
	AlignRight  = "right"
	AlignCenter = "center"
)

var escaper = strings.NewReplacer(`\`, `\\`, "|", `\|`, "\r\n", "<br>", "\r", "<br>", "\n", "<br>")

func pad(s string, w int, a string) string {
	gap := w - len([]rune(s))
	switch a {
	case AlignRight:
		return strings.Repeat(" ", gap) + s
	case AlignCenter:
		return strings.Repeat(" ", gap/2) + s + strings.Repeat(" ", gap-gap/2)
	}
	return s + strings.Repeat(" ", gap)
}

func sep(w int, a string) string {
	d := []byte(strings.Repeat("-", w))
	if a == AlignLeft || a == AlignCenter {
		d[0] = ':'
	}
	if a == AlignRight || a == AlignCenter {
		d[w-1] = ':'
	}
	return string(d)
}

func line(cells []string) string { return "| " + strings.Join(cells, " | ") + " |" }

// MarkdownTable renders headers and rows; align may be empty (no colons) or
// hold one of the Align constants per column.
func MarkdownTable(headers []string, rows [][]string, align []string) (string, error) {
	n := len(headers)
	if n == 0 {
		return "", ErrTable
	}
	if len(align) == 0 {
		align = make([]string, n)
	}
	if len(align) != n {
		return "", ErrTable
	}
	for _, a := range align {
		if a != AlignNone && a != AlignLeft && a != AlignRight && a != AlignCenter {
			return "", ErrTable
		}
	}
	cells := make([][]string, 0, len(rows)+1)
	for _, r := range append([][]string{headers}, rows...) {
		if len(r) != n {
			return "", ErrTable
		}
		esc := make([]string, n)
		for i, c := range r {
			esc[i] = escaper.Replace(c)
		}
		cells = append(cells, esc)
	}
	widths := make([]int, n)
	for i := range widths {
		widths[i] = 3
		for _, r := range cells {
			if l := len([]rune(r[i])); l > widths[i] {
				widths[i] = l
			}
		}
	}
	render := func(r []string) string {
		out := make([]string, n)
		for i, c := range r {
			out[i] = pad(c, widths[i], align[i])
		}
		return line(out)
	}
	lines := []string{render(cells[0])}
	seps := make([]string, n)
	for i := range seps {
		seps[i] = sep(widths[i], align[i])
	}
	lines = append(lines, line(seps))
	for _, r := range cells[1:] {
		lines = append(lines, render(r))
	}
	return strings.Join(lines, "\n"), nil
}
