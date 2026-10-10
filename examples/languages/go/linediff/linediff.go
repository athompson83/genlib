// SPDX-License-Identifier: Apache-2.0

// Package linediff computes a deterministic line diff from a longest common
// subsequence table and renders it in the GNU "diff -u" unified format,
// including "\ No newline at end of file" markers. Inputs are limited to
// 4,000,000 line pairs (the table is quadratic).
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

func split(t string) ([]string, bool) {
	if t == "" {
		return nil, true
	}
	lines := strings.Split(t, "\n")
	nl := strings.HasSuffix(t, "\n")
	if nl {
		lines = lines[:len(lines)-1]
	}
	return lines, nl
}

func ops(a, b []string) ([]Op, error) {
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
	out := make([]Op, 0, n+m)
	i, j := 0, 0
	for i < n || j < m {
		switch {
		case i < n && j < m && a[i] == b[j]:
			out = append(out, Op{"=", a[i]})
			i++
			j++
		case j >= m || i < n && L[i+1][j] >= L[i][j+1]:
			out = append(out, Op{"-", a[i]})
			i++
		default:
			out = append(out, Op{"+", b[j]})
			j++
		}
	}
	return out, nil
}

// Lines splits both texts on "\n" (a final "\n" ends the last line; "" has no
// lines) and returns the diff operations, preferring removals before
// additions.
func Lines(a, b string) ([]Op, error) {
	x, _ := split(a)
	y, _ := split(b)
	return ops(x, y)
}

type row struct {
	kind, line string
	ai, bi     int // line index in a / b, or -1
}

// Unified returns "" when the texts are equal, otherwise "--- from", "+++ to"
// and hunks formatted like GNU diff -u with context lines around each change.
func Unified(a, b, fromName, toName string, context int) (string, error) {
	if context < 0 {
		return "", errors.New("linediff: context must be >= 0")
	}
	x, anl := split(a)
	y, bnl := split(b)
	diff, err := ops(x, y)
	if err != nil {
		return "", err
	}
	rows := make([]row, 0, len(diff)+1)
	ai, bi := 0, 0
	for _, o := range diff {
		switch o.Kind {
		case "=":
			rows = append(rows, row{"=", o.Line, ai, bi})
			ai++
			bi++
		case "-":
			rows = append(rows, row{"-", o.Line, ai, -1})
			ai++
		default:
			rows = append(rows, row{"+", o.Line, -1, bi})
			bi++
		}
	}
	// A final common line that differs only by its trailing newline changes.
	if k := len(rows) - 1; anl != bnl && k >= 0 && rows[k].kind == "=" && rows[k].ai == len(x)-1 && rows[k].bi == len(y)-1 {
		r := rows[k]
		rows = append(rows[:k], row{"-", r.line, r.ai, -1}, row{"+", r.line, -1, r.bi})
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
			out.WriteString(map[string]string{"=": " ", "-": "-", "+": "+"}[r.kind] + r.line + "\n")
			if r.kind != "+" && r.ai == len(x)-1 && !anl && (r.kind == "-" || anl == bnl) {
				out.WriteString("\\ No newline at end of file\n")
			} else if r.kind == "+" && r.bi == len(y)-1 && !bnl {
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
