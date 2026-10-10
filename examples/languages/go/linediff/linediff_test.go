// SPDX-License-Identifier: Apache-2.0

package linediff

import (
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestUnifiedVectors(t *testing.T) {
	for _, tc := range unifiedVectors {
		if got, err := Unified(tc.a, tc.b, "a", "b", tc.context); err != nil || got != tc.want {
			t.Errorf("Unified(%q, %q, %d) = %q, %v; want %q", tc.a, tc.b, tc.context, got, err, tc.want)
		}
	}
}

func TestLinesVectors(t *testing.T) {
	for _, tc := range linesVectors {
		got, err := Lines(tc.a, tc.b)
		if len(got) == 0 && len(tc.want) == 0 {
			got, tc.want = nil, nil
		}
		if err != nil || !reflect.DeepEqual(got, tc.want) {
			t.Errorf("Lines(%q, %q) = %v, %v; want %v", tc.a, tc.b, got, err, tc.want)
		}
	}
}

// numbered returns "<prefix>0\n" ... "<prefix>(n-1)\n".
func numbered(prefix string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = prefix + strconv.Itoa(i)
	}
	return out
}

func TestLargeInputFast(t *testing.T) {
	a := numbered("line ", 100000)
	b := append([]string(nil), a...)
	for k := 0; k < 20; k++ {
		b[k*4999+17] = "edited " + strconv.Itoa(k)
	}
	start := time.Now()
	got, err := Lines(strings.Join(a, "\n")+"\n", strings.Join(b, "\n")+"\n")
	if err != nil {
		t.Fatal(err)
	}
	if d := time.Since(start); d > 10*time.Second {
		t.Fatalf("100,000-line diff took %v", d)
	}
	changes := 0
	for _, o := range got {
		if o.Kind != "=" {
			changes++
		}
	}
	if changes != 40 {
		t.Fatalf("got %d changed lines, want 40", changes)
	}
}

func TestNoCommonLine(t *testing.T) {
	a := strings.Join(numbered("a", 3000), "\n") + "\n"
	b := strings.Join(numbered("b", 3000), "\n") + "\n"
	got, err := Lines(a, b)
	if err != nil {
		t.Fatal(err)
	}
	del, ins := 0, 0
	for _, o := range got {
		switch o.Kind {
		case "-":
			del++
		case "+":
			ins++
		}
	}
	if del != 3000 || ins != 3000 || len(got) != 6000 {
		t.Fatalf("got %d deletions, %d insertions of %d ops", del, ins, len(got))
	}
}

func TestLimitAndContext(t *testing.T) {
	big := strings.Repeat("x\n", MaxLines/2)
	if _, err := Lines(big, big+"y\n"); err == nil {
		t.Error("more than 1,000,000 lines want error")
	}
	if _, err := Unified("a\n", "b\n", "a", "b", -1); err == nil {
		t.Error("negative context want error")
	}
}

// patch applies a unified diff produced by Unified to a.
func patch(t *testing.T, a, diff string) string {
	t.Helper()
	if diff == "" {
		return a
	}
	src := split(a)
	var out []line
	pos := 0
	rows := strings.Split(strings.TrimSuffix(diff, "\n"), "\n")[2:]
	for k := 0; k < len(rows); k++ {
		r := rows[k]
		if strings.HasPrefix(r, "@@ -") {
			start, _ := strconv.Atoi(strings.SplitN(strings.Fields(r)[1][1:], ",", 2)[0])
			first := start - 1
			if strings.HasSuffix(strings.Fields(r)[1], ",0") {
				first = start
			}
			for pos < first {
				out = append(out, src[pos])
				pos++
			}
			continue
		}
		noEOL := k+1 < len(rows) && strings.HasPrefix(rows[k+1], "\\ ")
		switch r[0] {
		case ' ':
			out = append(out, src[pos])
			pos++
		case '-':
			pos++
		case '+':
			out = append(out, line{r[1:], noEOL})
		}
	}
	out = append(out, src[pos:]...)
	var b strings.Builder
	for _, l := range out {
		b.WriteString(l.text)
		if !l.noEOL {
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func TestPatchRoundTrip(t *testing.T) {
	for _, tc := range unifiedVectors {
		got, err := Unified(tc.a, tc.b, "a", "b", tc.context)
		if err != nil {
			t.Fatal(err)
		}
		if back := patch(t, tc.a, got); back != tc.b {
			t.Errorf("patch(%q, Unified) = %q; want %q", tc.a, back, tc.b)
		}
	}
}
