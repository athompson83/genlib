// SPDX-License-Identifier: Apache-2.0

// Package linediff computes a deterministic line diff from a longest common
// subsequence table and renders it as a valid unified diff (patch reproduces
// the new text); same format as GNU diff -u, which may pick a different
// alignment of equal size. A last line without a trailing newline only
// matches another last line without one, and is followed by
// "\ No newline at end of file". Inputs are limited to 4,000,000 line pairs
// (the table is quadratic).
package linediff

import (
	"errors"
	"strconv"
	"strings"
)

// Op is one diff line: Kind is "=" (unchanged), "-" (removed) or "+" (added).
type Op struct {
	Kind, Line string
}

// line is one split line; noEOL marks the last line of a text that does not
// end in "\n". Two lines are equal only if both fields are equal.
type line struct {
	text  string
	noEOL bool
}

type lineOp struct {
	kind string
	line line
}

func split(t string) []line {
	if t == "" {
		return nil
	}
	parts := strings.Split(t, "\n")
	if strings.HasSuffix(t, "\n") {
		parts = parts[:len(parts)-1]
	}
	lines := make([]line, len(parts))
	for i, p := range parts {
		lines[i] = line{text: p}
	}
	if !strings.HasSuffix(t, "\n") {
		lines[len(lines)-1].noEOL = true
	}
	return lines
}

func ops(a, b []line) ([]lineOp, error) {
	n, m := len(a), len(b)
	if int64(n)*int64(m) > 4000000 {
		return nil, errors.New("linediff: input too large (lines(a) * lines(b) > 4,000,000)")
	}
	L := make([][]int32, n+1)
	for i := range L {
		L[i] = make([]int32, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			switch {
			case a[i] == b[j]:
				L[i][j] = L[i+1][j+1] + 1
			case L[i+1][j] >= L[i][j+1]:
				L[i][j] = L[i+1][j]
			default:
				L[i][j] = L[i][j+1]
			}
		}
	}
	out := make([]lineOp, 0, n+m)
	i, j := 0, 0
	for i < n || j < m {
		switch {
		case i < n && j < m && a[i] == b[j]:
			out = append(out, lineOp{"=", a[i]})
			i++
			j++
		case j >= m || i < n && L[i+1][j] >= L[i][j+1]:
			out = append(out, lineOp{"-", a[i]})
			i++
		default:
			out = append(out, lineOp{"+", b[j]})
			j++
		}
	}
	return out, nil
}

// Lines splits both texts on "\n" (a final "\n" ends the last line; "" has no
// lines) and returns the diff operations, preferring removals before
// additions. A last line without "\n" only matches another such last line.
func Lines(a, b string) ([]Op, error) {
	diff, err := ops(split(a), split(b))
	if err != nil {
		return nil, err
	}
	out := make([]Op, len(diff))
	for i, o := range diff {
		out[i] = Op{o.kind, o.line.text}
	}
	return out, nil
}

// Unified returns "" when the texts are equal, otherwise "--- from", "+++ to"
// and hunks with context lines around each change: a valid unified diff
// (patch reproduces the new text); same format as GNU diff -u, which may pick
// a different alignment of equal size.
func Unified(a, b, fromName, toName string, context int) (string, error) {
	if context < 0 {
		return "", errors.New("linediff: context must be >= 0")
	}
	rows, err := ops(split(a), split(b))
	if err != nil {
		return "", err
	}
	if context > len(rows) {
		context = len(rows) // larger values cannot change the output
	}
	var changes []int
	for k, r := range rows {
		if r.kind != "=" {
			changes = append(changes, k)
		}
	}
	if len(changes) == 0 {
		return "", nil
	}
	type span struct{ s, e int }
	hunks := []span{{changes[0], changes[0]}}
	for _, k := range changes[1:] {
		if last := &hunks[len(hunks)-1]; k-last.e-1 <= 2*context {
			last.e = k
		} else {
			hunks = append(hunks, span{k, k})
		}
	}
	var out strings.Builder
	out.WriteString("--- " + fromName + "\n+++ " + toName + "\n")
	for _, h := range hunks {
		s, e := h.s-context, h.e+context
		if s < 0 {
			s = 0
		}
		if e > len(rows)-1 {
			e = len(rows) - 1
		}
		aBefore, bBefore := 0, 0
		for _, r := range rows[:s] {
			if r.kind != "+" {
				aBefore++
			}
			if r.kind != "-" {
				bBefore++
			}
		}
		aCount, bCount := 0, 0
		for _, r := range rows[s : e+1] {
			if r.kind != "+" {
				aCount++
			}
			if r.kind != "-" {
				bCount++
			}
		}
		out.WriteString("@@ -" + rng(aBefore, aCount) + " +" + rng(bBefore, bCount) + " @@\n")
		for _, r := range rows[s : e+1] {
			out.WriteString(map[string]string{"=": " ", "-": "-", "+": "+"}[r.kind] + r.line.text + "\n")
			if r.line.noEOL {
				out.WriteString("\\ No newline at end of file\n")
			}
		}
	}
	return out.String(), nil
}

// rng writes a hunk range: "start" for one line, "start,count" otherwise and
// "before,0" for an empty side. The first line of a hunk side is before+1.
func rng(before, count int) string {
	switch count {
	case 0:
		return strconv.Itoa(before) + ",0"
	case 1:
		return strconv.Itoa(before + 1)
	}
	return strconv.Itoa(before+1) + "," + strconv.Itoa(count)
}
