// SPDX-License-Identifier: Apache-2.0

// Package passwordpolicy checks passwords the NIST SP 800-63B way: length in
// Unicode code points, a blocklist and context words, no composition rules.
// Use a large breached-password list as the blocklist, allow every printable
// character including spaces and emoji, never truncate, and rate-limit
// attempts on the server. Store passwords only with a password hash.
package passwordpolicy

import (
	"errors"
	"strings"
)

// Options configure the check; start from DefaultOptions.
type Options struct {
	MinLength, MaxLength int
	Blocklist            []string // compared after ASCII lowercasing
	Context              []string // user name, email, service name; >= 4 chars apply
}

// Result lists failures in the order too-short, too-long, control-characters,
// blocklisted, contains-context, repetitive.
type Result struct {
	OK       bool
	Failures []string
}

// DefaultOptions returns MinLength 15 and MaxLength 64.
func DefaultOptions() Options { return Options{MinLength: 15, MaxLength: 64} }

func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

const alnum = "0123456789abcdefghijklmnopqrstuvwxyz"

func reverse(s string) string {
	b := []byte(s)
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}

func repetitive(cps []rune) bool {
	for i := 0; i+4 <= len(cps); i++ {
		w := cps[i : i+4]
		if w[0] == w[1] && w[1] == w[2] && w[2] == w[3] {
			return true
		}
		lw := asciiLower(string(w))
		if len(lw) == 4 && strings.Trim(lw, alnum) == "" && (strings.Contains(alnum, lw) || strings.Contains(alnum, reverse(lw))) {
			return true
		}
	}
	return false
}

// Check returns the failures for password, or an error when MinLength < 1 or
// MaxLength < MinLength.
func Check(password string, o Options) (Result, error) {
	if o.MinLength < 1 || o.MaxLength < o.MinLength {
		return Result{}, errors.New("passwordpolicy: need 1 <= MinLength <= MaxLength")
	}
	cps := []rune(password)
	fails := []string{}
	if len(cps) < o.MinLength {
		fails = append(fails, "too-short")
	}
	if len(cps) > o.MaxLength {
		fails = append(fails, "too-long")
	}
	for _, c := range cps {
		if c < 0x20 || c >= 0x7f && c <= 0x9f {
			fails = append(fails, "control-characters")
			break
		}
	}
	low := asciiLower(password)
	for _, b := range o.Blocklist {
		if low == asciiLower(b) {
			fails = append(fails, "blocklisted")
			break
		}
	}
	for _, c := range o.Context {
		if len([]rune(c)) >= 4 && strings.Contains(low, asciiLower(c)) {
			fails = append(fails, "contains-context")
			break
		}
	}
	if repetitive(cps) {
		fails = append(fails, "repetitive")
	}
	return Result{len(fails) == 0, fails}, nil
}
