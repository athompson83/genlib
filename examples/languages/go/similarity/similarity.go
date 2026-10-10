// SPDX-License-Identifier: Apache-2.0

// Package similarity measures string distance over Unicode code points (not
// bytes or UTF-16 units): Levenshtein, optimal string alignment (Damerau),
// Jaro, Jaro-Winkler and a normalized similarity ratio.
package similarity

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Levenshtein returns the insert/delete/substitute edit distance.
func Levenshtein(a, b string) int {
	x, y := []rune(a), []rune(b)
	prev := make([]int, len(y)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(x); i++ {
		cur := make([]int, len(y)+1)
		cur[0] = i
		for j := 1; j <= len(y); j++ {
			cost := 1
			if x[i-1] == y[j-1] {
				cost = 0
			}
			cur[j] = minInt(minInt(prev[j]+1, cur[j-1]+1), prev[j-1]+cost)
		}
		prev = cur
	}
	return prev[len(y)]
}

// DamerauOSA returns the optimal string alignment distance: Levenshtein plus
// adjacent transposition at cost 1 (no substring edited twice).
func DamerauOSA(a, b string) int {
	x, y := []rune(a), []rune(b)
	n, m := len(x), len(y)
	d := make([][]int, n+1)
	for i := range d {
		d[i] = make([]int, m+1)
		d[i][0] = i
	}
	for j := 0; j <= m; j++ {
		d[0][j] = j
	}
	for i := 1; i <= n; i++ {
		for j := 1; j <= m; j++ {
			cost := 1
			if x[i-1] == y[j-1] {
				cost = 0
			}
			d[i][j] = minInt(minInt(d[i-1][j]+1, d[i][j-1]+1), d[i-1][j-1]+cost)
			if i > 1 && j > 1 && x[i-1] == y[j-2] && x[i-2] == y[j-1] {
				d[i][j] = minInt(d[i][j], d[i-2][j-2]+1)
			}
		}
	}
	return d[n][m]
}

// Jaro returns the Jaro similarity in [0, 1]: 1 for two empty strings, 0 when
// exactly one is empty. The match window is max(len)/2 - 1, floored at 0.
func Jaro(a, b string) float64 {
	x, y := []rune(a), []rune(b)
	if len(x) == 0 && len(y) == 0 {
		return 1
	}
	if len(x) == 0 || len(y) == 0 {
		return 0
	}
	longest := len(x)
	if len(y) > longest {
		longest = len(y)
	}
	w := longest/2 - 1
	if w < 0 {
		w = 0
	}
	mx, my := make([]bool, len(x)), make([]bool, len(y))
	m := 0
	for i, c := range x {
		lo, hi := i-w, minInt(len(y), i+w+1)
		if lo < 0 {
			lo = 0
		}
		for j := lo; j < hi; j++ {
			if !my[j] && y[j] == c {
				mx[i], my[j] = true, true
				m++
				break
			}
		}
	}
	if m == 0 {
		return 0
	}
	t, k := 0, 0
	for i := range x {
		if mx[i] {
			for !my[k] {
				k++
			}
			if x[i] != y[k] {
				t++
			}
			k++
		}
	}
	fm := float64(m)
	return (fm/float64(len(x)) + fm/float64(len(y)) + (fm-float64(t)/2)/fm) / 3
}

// JaroWinkler boosts Jaro by a common prefix of at most 4 code points with
// prefix scale 0.1.
func JaroWinkler(a, b string) float64 {
	j := Jaro(a, b)
	x, y := []rune(a), []rune(b)
	l := 0
	for l < len(x) && l < len(y) && l < 4 && x[l] == y[l] {
		l++
	}
	return j + float64(l)*0.1*(1-j)
}

// Ratio returns 1 - Levenshtein / max(len), and 1 for two empty strings.
func Ratio(a, b string) float64 {
	n := len([]rune(a))
	if m := len([]rune(b)); m > n {
		n = m
	}
	if n == 0 {
		return 1
	}
	return 1 - float64(Levenshtein(a, b))/float64(n)
}
