// SPDX-License-Identifier: Apache-2.0

// Package shellquote quotes and splits POSIX shell words without performing
// any expansion ($, *, ~ and the like stay literal).
//
// Quote leaves words made only of [A-Za-z0-9@%+=:,./_-] unchanged and wraps
// everything else in single quotes. Split follows sh word rules: single
// quotes are literal; inside double quotes a backslash escapes only $ ` " \
// and newline; outside quotes it escapes any character; backslash-newline is
// removed; '#' starts a comment only at the start of a word.
package shellquote

import (
	"errors"
	"strings"
)

// ErrSplit is wrapped by every Split error.
var ErrSplit = errors.New("shellquote: cannot split")

type splitError struct{ msg string }

func (e *splitError) Error() string { return "shellquote: " + e.msg }
func (e *splitError) Unwrap() error { return ErrSplit }

func safe(arg string) bool {
	for _, c := range arg {
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.ContainsRune("@%+=:,./_-", c)) {
			return false
		}
	}
	return true
}

// ShellQuote returns arg quoted so that a POSIX shell reads it as one word.
func ShellQuote(arg string) string {
	if arg == "" {
		return "''"
	}
	if safe(arg) {
		return arg
	}
	return "'" + strings.ReplaceAll(arg, "'", `'\''`) + "'"
}

// ShellJoin quotes each argument and joins them with single spaces.
func ShellJoin(args []string) string {
	q := make([]string, len(args))
	for i, a := range args {
		q[i] = ShellQuote(a)
	}
	return strings.Join(q, " ")
}

// ShellSplit splits a command line into words using POSIX quoting rules.
func ShellSplit(line string) ([]string, error) {
	r := []rune(line)
	n := len(r)
	words := []string{}
	var cur strings.Builder
	open := false
	for i := 0; i < n; {
		c := r[i]
		if c == ' ' || c == '\t' || c == '\n' {
			if open {
				words = append(words, cur.String())
				cur.Reset()
				open = false
			}
			i++
			continue
		}
		if c == '#' && !open {
			for i < n && r[i] != '\n' {
				i++
			}
			continue
		}
		open = true
		switch c {
		case '\'':
			j := i + 1
			for j < n && r[j] != '\'' {
				j++
			}
			if j >= n {
				return nil, &splitError{"unterminated single quote"}
			}
			cur.WriteString(string(r[i+1 : j]))
			i = j + 1
		case '"':
			i++
			for {
				if i >= n {
					return nil, &splitError{"unterminated double quote"}
				}
				d := r[i]
				if d == '"' {
					i++
					break
				}
				if d == '\\' && i+1 < n && strings.ContainsRune("$`\"\\\n", r[i+1]) {
					if r[i+1] != '\n' {
						cur.WriteRune(r[i+1])
					}
					i += 2
					continue
				}
				cur.WriteRune(d)
				i++
			}
		case '\\':
			if i+1 >= n {
				return nil, &splitError{"trailing backslash"}
			}
			if r[i+1] != '\n' {
				cur.WriteRune(r[i+1])
			} else if cur.Len() == 0 {
				open = false
			}
			i += 2
		default:
			cur.WriteRune(c)
			i++
		}
	}
	if open {
		words = append(words, cur.String())
	}
	return words, nil
}
