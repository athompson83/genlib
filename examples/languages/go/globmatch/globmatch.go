// SPDX-License-Identifier: Apache-2.0

// Package globmatch matches '/'-separated paths against glob patterns: '*', '?'
// and '[...]' never cross '/', a whole-segment '**' matches zero or more
// segments, '{a,b}' alternatives (no nesting) are expanded first and '\' escapes
// the next character. A segment starting with '.' is matched only by a pattern
// segment starting with a literal '.' unless dot is true. Matching is
// case-sensitive and one code point per '?'.
package globmatch

import (
	"errors"
	"strings"
)

// ErrPattern is wrapped by every pattern syntax error.
var ErrPattern = errors.New("glob: invalid pattern")

func perr(msg string) error { return &patternError{msg} }

type patternError struct{ msg string }

func (e *patternError) Error() string { return "glob: " + e.msg }
func (e *patternError) Unwrap() error { return ErrPattern }

func expandBraces(p []rune) ([][]rune, error) {
	i := -1
	for k := 0; k < len(p); {
		if p[k] == '\\' {
			k += 2
			continue
		}
		if p[k] == '{' {
			i = k
			break
		}
		if p[k] == '}' {
			return nil, perr("unmatched }")
		}
		k++
	}
	if i < 0 {
		return [][]rune{p}, nil
	}
	var parts [][]rune
	var cur []rune
	j, closed := i+1, false
	for j < len(p) {
		c := p[j]
		if c == '\\' {
			end := j + 2
			if end > len(p) {
				end = len(p)
			}
			cur = append(cur, p[j:end]...)
			j += 2
			continue
		}
		if c == '{' {
			return nil, perr("nested braces are not supported")
		}
		if c == ',' {
			parts = append(parts, cur)
			cur = nil
			j++
			continue
		}
		if c == '}' {
			parts = append(parts, cur)
			closed = true
			break
		}
		cur = append(cur, c)
		j++
	}
	if !closed {
		return nil, perr("unterminated {")
	}
	var res [][]rune
	for _, alt := range parts {
		next := append(append(append([]rune{}, p[:i]...), alt...), p[j+1:]...)
		sub, err := expandBraces(next)
		if err != nil {
			return nil, err
		}
		res = append(res, sub...)
	}
	return res, nil
}

func segMatch(pat, s []rune, dot bool) (bool, error) {
	if !dot && len(s) > 0 && s[0] == '.' && !(len(pat) > 0 && pat[0] == '.') && !(len(pat) > 1 && pat[0] == '\\' && pat[1] == '.') {
		return false, nil
	}
	memo := map[[2]int]bool{}
	var m func(pi, si int) (bool, error)
	m = func(pi, si int) (bool, error) {
		key := [2]int{pi, si}
		if v, ok := memo[key]; ok {
			return v, nil
		}
		for pi < len(pat) {
			c := pat[pi]
			if c == '*' {
				for pi < len(pat) && pat[pi] == '*' {
					pi++
				}
				if pi == len(pat) {
					memo[key] = true
					return true, nil
				}
				for k := si; k <= len(s); k++ {
					ok, err := m(pi, k)
					if err != nil {
						return false, err
					}
					if ok {
						memo[key] = true
						return true, nil
					}
				}
				memo[key] = false
				return false, nil
			}
			if si >= len(s) {
				memo[key] = false
				return false, nil
			}
			if c == '?' {
				pi++
				si++
				continue
			}
			if c == '[' {
				j, neg := pi+1, false
				if j < len(pat) && (pat[j] == '!' || pat[j] == '^') {
					neg = true
					j++
				}
				hit, first := false, true
				for {
					if j >= len(pat) {
						return false, perr("unterminated [")
					}
					if pat[j] == ']' && !first {
						break
					}
					first = false
					a := pat[j]
					if a == '\\' && j+1 < len(pat) {
						j++
						a = pat[j]
					}
					if j+2 < len(pat) && pat[j+1] == '-' && pat[j+2] != ']' {
						b := pat[j+2]
						if b == '\\' && j+3 < len(pat) {
							j++
							b = pat[j+2]
						}
						if a <= s[si] && s[si] <= b {
							hit = true
						}
						j += 3
					} else {
						if a == s[si] {
							hit = true
						}
						j++
					}
				}
				if hit == neg {
					memo[key] = false
					return false, nil
				}
				pi = j + 1
				si++
				continue
			}
			if c == '\\' {
				if pi+1 >= len(pat) {
					return false, perr("trailing backslash")
				}
				c = pat[pi+1]
				pi++
			}
			if s[si] != c {
				memo[key] = false
				return false, nil
			}
			pi++
			si++
		}
		r := si == len(s)
		memo[key] = r
		return r, nil
	}
	return m(0, 0)
}

func splitSegments(p []rune) [][]rune {
	var segs [][]rune
	var cur []rune
	for k := 0; k < len(p); {
		if p[k] == '\\' && k+1 < len(p) {
			cur = append(cur, p[k], p[k+1])
			k += 2
			continue
		}
		if p[k] == '/' {
			segs = append(segs, cur)
			cur = nil
			k++
			continue
		}
		cur = append(cur, p[k])
		k++
	}
	return append(segs, cur)
}

func matchOne(pattern []rune, path string, dot bool) (bool, error) {
	ps := splitSegments(pattern)
	var ss [][]rune
	for _, s := range strings.Split(path, "/") {
		ss = append(ss, []rune(s))
	}
	memo := map[[2]int]bool{}
	var m func(i, j int) (bool, error)
	m = func(i, j int) (bool, error) {
		key := [2]int{i, j}
		if v, ok := memo[key]; ok {
			return v, nil
		}
		var r bool
		if i == len(ps) {
			r = j == len(ss)
		} else if string(ps[i]) == "**" {
			for k := j; k <= len(ss); k++ {
				if k > j && !dot && len(ss[k-1]) > 0 && ss[k-1][0] == '.' {
					break
				}
				ok, err := m(i+1, k)
				if err != nil {
					return false, err
				}
				if ok {
					r = true
					break
				}
			}
		} else if j < len(ss) {
			ok, err := segMatch(ps[i], ss[j], dot)
			if err != nil {
				return false, err
			}
			if ok {
				if r, err = m(i+1, j+1); err != nil {
					return false, err
				}
			}
		}
		memo[key] = r
		return r, nil
	}
	return m(0, 0)
}

func validate(pattern []rune) error {
	if len(pattern) == 0 {
		return perr("empty pattern")
	}
	n := 0
	for k := len(pattern) - 1; k >= 0 && pattern[k] == '\\'; k-- {
		n++
	}
	if n%2 == 1 {
		return perr("trailing backslash")
	}
	for k := 0; k < len(pattern); k++ {
		if pattern[k] == '\\' {
			k++
			continue
		}
		if pattern[k] == '[' {
			j := k + 1
			if j < len(pattern) && (pattern[j] == '!' || pattern[j] == '^') {
				j++
			}
			if j < len(pattern) && pattern[j] == ']' {
				j++
			}
			for j < len(pattern) && pattern[j] != ']' {
				if pattern[j] == '\\' {
					j += 2
				} else {
					j++
				}
			}
			if j >= len(pattern) {
				return perr("unterminated [")
			}
			k = j
		}
	}
	return nil
}

// Match reports whether path matches pattern; dot lets wildcards match segments starting with '.'.
func Match(pattern, path string, dot bool) (bool, error) {
	p := []rune(pattern)
	if err := validate(p); err != nil {
		return false, err
	}
	alts, err := expandBraces(p)
	if err != nil {
		return false, err
	}
	for _, a := range alts {
		ok, err := matchOne(a, path, dot)
		if err != nil {
			return false, err
		}
		if ok {
			return true, nil
		}
	}
	return false, nil
}

// Filter returns the paths that match pattern, in their original order.
func Filter(pattern string, paths []string, dot bool) ([]string, error) {
	out := []string{}
	for _, p := range paths {
		ok, err := Match(pattern, p, dot)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, p)
		}
	}
	return out, nil
}
