// SPDX-License-Identifier: Apache-2.0

// Package linediff computes a minimal line diff (a shortest edit script) and
// renders it as a valid unified diff: patch reproduces the new text. The
// output usually equals GNU diff -u (about 95% of small random inputs) but
// that is not guaranteed; another alignment of equal size may be chosen.
//
// Algorithm: lines that occur nowhere in the other text are marked changed
// first; Myers' linear-space middle-snake recursion (Myers 1986, section 4b)
// runs on the remaining lines; each run of changes then slides down while the
// line after it equals its first line, and a run of one side's changes moves
// up through equal lines when that places it beside the other side's changes.
// Time is O((N+M)·D) and memory O(N+M). Inputs are limited to 1,000,000 lines
// in total.
//
// A last line without a trailing newline only matches another last line
// without one, and is followed by "\ No newline at end of file".
package linediff

import (
	"errors"
	"strconv"
	"strings"
)

// MaxLines is the largest total number of lines (both texts) accepted.
const MaxLines = 1000000

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
	nl := strings.HasSuffix(t, "\n")
	if nl {
		parts = parts[:len(parts)-1]
	}
	lines := make([]line, len(parts))
	for i, p := range parts {
		lines[i] = line{text: p}
	}
	if !nl {
		lines[len(lines)-1].noEOL = true
	}
	return lines
}

// middleSnake returns (x, y, u, v): a middle snake from (x, y) to (u, v) of
// the box a[a0:a1] x b[b0:b1].
func middleSnake(a, b []int, a0, a1, b0, b1 int) (int, int, int, int) {
	n, m := a1-a0, b1-b0
	delta := n - m
	odd := delta&1 != 0
	off := n + m + 1
	vf := make([]int, 2*off+1) // vf[off+k]: furthest x on diagonal k (x - y = k)
	vb := make([]int, 2*off+1) // the same on the reversed sequences
	for d := 0; d <= (n+m+1)/2; d++ {
		for k := -d; k <= d; k += 2 { // forward
			var x int
			if k == -d || (k != d && vf[off+k-1] < vf[off+k+1]) {
				x = vf[off+k+1]
			} else {
				x = vf[off+k-1] + 1
			}
			y := x - k
			sx, sy := x, y
			for x < n && y < m && a[a0+x] == b[b0+y] {
				x++
				y++
			}
			vf[off+k] = x
			if odd && delta-(d-1) <= k && k <= delta+(d-1) && x+vb[off+delta-k] >= n {
				return a0 + sx, b0 + sy, a0 + x, b0 + y
			}
		}
		for k := -d; k <= d; k += 2 { // backward, on reversed sequences
			var x int
			if k == -d || (k != d && vb[off+k-1] < vb[off+k+1]) {
				x = vb[off+k+1]
			} else {
				x = vb[off+k-1] + 1
			}
			y := x - k
			sx, sy := x, y
			for x < n && y < m && a[a1-1-x] == b[b1-1-y] {
				x++
				y++
			}
			vb[off+k] = x
			if !odd && -d <= delta-k && delta-k <= d && x+vf[off+delta-k] >= n {
				return a1 - x, b1 - y, a1 - sx, b1 - sy
			}
		}
	}
	panic("linediff: no middle snake")
}

func compare(a, b []int, a0, a1, b0, b1 int, ca, cb []bool) {
	for a0 < a1 && b0 < b1 && a[a0] == b[b0] {
		a0++
		b0++
	}
	for a1 > a0 && b1 > b0 && a[a1-1] == b[b1-1] {
		a1--
		b1--
	}
	if a0 == a1 {
		for j := b0; j < b1; j++ {
			cb[j] = true
		}
		return
	}
	if b0 == b1 {
		for i := a0; i < a1; i++ {
			ca[i] = true
		}
		return
	}
	x, y, u, v := middleSnake(a, b, a0, a1, b0, b1)
	compare(a, b, a0, x, b0, y, ca, cb)
	compare(a, b, u, a1, v, b1, ca, cb)
}

// slide moves each run of changed lines down while the line after it equals
// its first line.
func slide(lines []int, changed []bool) {
	i, n := 0, len(lines)
	for i < n {
		if !changed[i] {
			i++
			continue
		}
		j := i
		for j < n && changed[j] {
			j++
		}
		for j < n && lines[i] == lines[j] {
			changed[i] = false
			changed[j] = true
			i++
			j++
			for j < n && changed[j] { // merged with the next run
				j++
			}
		}
		i = j
	}
}

// pairs returns the equal line pairs (i, j) in order.
func pairs(ca, cb []bool) [][2]int {
	var out [][2]int
	i, j := 0, 0
	for i < len(ca) || j < len(cb) {
		switch {
		case i < len(ca) && ca[i]:
			i++
		case j < len(cb) && cb[j]:
			j++
		default:
			out = append(out, [2]int{i, j})
			i++
			j++
		}
	}
	return out
}

// align makes one bottom-up pass: it slides a run of changed x lines up
// through equal lines (into gaps with no changed x lines) when that places it
// next to changed lines of the other file, so the hunk shows a replacement
// instead of a deletion and an insertion apart.
func align(x []int, cx, cy []bool, swap bool) {
	var e [][2]int
	if swap {
		for _, p := range pairs(cy, cx) {
			e = append(e, [2]int{p[1], p[0]})
		}
	} else {
		e = pairs(cx, cy)
	}
	xb := make([]int, len(e)+1) // xb[g]: x index of the pair above gap g
	yb := make([]int, len(e)+2) // gap g holds other-file lines yb[g]+1 .. yb[g+1]-1
	xe := make([]int, len(e)+1) // gap g holds x lines xb[g]+1 .. xe[g]-1
	xb[0], yb[0] = -1, -1
	for k, p := range e {
		xb[k+1], yb[k+1], xe[k] = p[0], p[1], p[0]
	}
	yb[len(e)+1], xe[len(e)] = len(cy), len(cx)
	for g := len(e); g >= 1; g-- {
		x0, x1 := xb[g]+1, xe[g]
		if x1 > x0 && yb[g+1]-yb[g] == 1 { // a run of x changes with no other-file change beside it
			h, top, last := g, x0, x1-1
			for h >= 1 && xb[h] == top-1 && x[top-1] == x[last] {
				// the run now sits in gap h
				h--
				top--
				last--
				if yb[h+1]-yb[h] > 1 { // other-file changes here: move the run
					for k := top; k < x0; k++ {
						cx[k] = true
					}
					for k := last + 1; k < x1; k++ {
						cx[k] = false
					}
					g = h
					break
				}
				if h >= 1 && xe[h]-xb[h] > 1 { // would merge with another x run
					break
				}
			}
		}
	}
}

func ops(a, b []line) ([]lineOp, error) {
	if len(a)+len(b) > MaxLines {
		return nil, errors.New("linediff: input too large (more than 1,000,000 lines)")
	}
	// Intern lines so that comparisons are integer comparisons.
	ids := make(map[line]int)
	intern := func(ls []line) []int {
		out := make([]int, len(ls))
		for i, l := range ls {
			id, ok := ids[l]
			if !ok {
				id = len(ids)
				ids[l] = id
			}
			out[i] = id
		}
		return out
	}
	ia, ib := intern(a), intern(b)
	inA := make([]bool, len(ids))
	inB := make([]bool, len(ids))
	for _, id := range ia {
		inA[id] = true
	}
	for _, id := range ib {
		inB[id] = true
	}
	// A line that never occurs in the other file is in no common subsequence:
	// mark it changed and run Myers only on the remaining lines (the result
	// stays minimal).
	ca, cb := make([]bool, len(a)), make([]bool, len(b))
	var ka, kb, fa, fb []int
	for i, id := range ia {
		if inB[id] {
			ka = append(ka, i)
			fa = append(fa, id)
		} else {
			ca[i] = true
		}
	}
	for j, id := range ib {
		if inA[id] {
			kb = append(kb, j)
			fb = append(fb, id)
		} else {
			cb[j] = true
		}
	}
	sa, sb := make([]bool, len(fa)), make([]bool, len(fb))
	compare(fa, fb, 0, len(fa), 0, len(fb), sa, sb)
	for k, i := range ka {
		ca[i] = sa[k]
	}
	for k, j := range kb {
		cb[j] = sb[k]
	}
	slide(ia, ca)
	slide(ib, cb)
	align(ia, ca, cb, false)
	align(ib, cb, ca, true)
	out := make([]lineOp, 0, len(a)+len(b))
	i, j := 0, 0
	for i < len(a) || j < len(b) {
		switch {
		case i < len(a) && ca[i]:
			out = append(out, lineOp{"-", a[i]})
			i++
		case j < len(b) && cb[j]:
			out = append(out, lineOp{"+", b[j]})
			j++
		default:
			out = append(out, lineOp{"=", a[i]})
			i++
			j++
		}
	}
	return out, nil
}

// Lines splits both texts on "\n" (a final "\n" ends the last line; "" has no
// lines) and returns a minimal list of diff operations. A last line without
// "\n" only matches another such last line.
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
// and hunks with context lines around each change (hunks join when the gap is
// at most 2*context lines): a valid unified diff (patch reproduces the new
// text), usually but not always identical to GNU diff -u.
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
	aBefore, bBefore, pos := 0, 0, 0
	for _, h := range hunks {
		s, e := h.s-context, h.e+context
		if s < 0 {
			s = 0
		}
		if e > len(rows)-1 {
			e = len(rows) - 1
		}
		for ; pos < s; pos++ {
			if rows[pos].kind != "+" {
				aBefore++
			}
			if rows[pos].kind != "-" {
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
			switch r.kind {
			case "=":
				out.WriteByte(' ')
			default:
				out.WriteString(r.kind)
			}
			out.WriteString(r.line.text)
			out.WriteByte('\n')
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
