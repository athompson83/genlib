// SPDX-License-Identifier: Apache-2.0

// Package passgen generates passwords and passphrases from an injected byte
// source, so tests are deterministic; Password and Passphrase use crypto/rand.
// Indexes are unbiased (rejection sampling), one character is drawn from each
// requested class in order, the rest from the union of the classes, and the
// result is Fisher-Yates shuffled.
package passgen

import (
	"crypto/rand"
	"errors"
	"math"
	"strings"
)

// ErrPassGen is returned for invalid arguments.
var ErrPassGen = errors.New("passgen: invalid arguments")

var classSets = map[string]string{
	"lower":   "abcdefghijklmnopqrstuvwxyz",
	"upper":   "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
	"digits":  "0123456789",
	"symbols": "!#$%&*+-=?@^_~",
}

const ambiguous = "Il1O0o"

// DefaultClasses lists every character class in canonical order.
var DefaultClasses = []string{"lower", "upper", "digits", "symbols"}

// RandomIndex returns an unbiased index in [0, n) built from big-endian bytes of nextByte.
func RandomIndex(n int, nextByte func() byte) (int, error) {
	if n < 1 {
		return 0, ErrPassGen
	}
	if n == 1 {
		return 0, nil
	}
	un := uint64(n)
	k := 1
	for k < 8 && uint64(1)<<(8*uint(k)) < un {
		k++
	}
	var lastOK uint64 // largest accepted x
	if k == 8 {
		lastOK = math.MaxUint64 - (math.MaxUint64%un+1)%un
	} else {
		span := uint64(1) << (8 * uint(k))
		lastOK = span/un*un - 1
	}
	for {
		var x uint64
		for i := 0; i < k; i++ {
			x = x<<8 | uint64(nextByte())
		}
		if x <= lastOK {
			return int(x % un), nil
		}
	}
}

// GeneratePassword builds a password of length (classes..1024) with one character from each class.
func GeneratePassword(length int, classes []string, nextByte func() byte, excludeAmbiguous bool) (string, error) {
	if len(classes) == 0 {
		return "", ErrPassGen
	}
	seen := map[string]bool{}
	for _, c := range classes {
		if _, ok := classSets[c]; !ok || seen[c] {
			return "", ErrPassGen
		}
		seen[c] = true
	}
	if length < len(classes) || length > 1024 {
		return "", ErrPassGen
	}
	alph := make([]string, len(classes))
	for i, c := range classes {
		set := classSets[c]
		if excludeAmbiguous {
			set = strings.Map(func(r rune) rune {
				if strings.ContainsRune(ambiguous, r) {
					return -1
				}
				return r
			}, set)
		}
		alph[i] = set
	}
	out := make([]byte, 0, length)
	for _, a := range alph {
		j, _ := RandomIndex(len(a), nextByte)
		out = append(out, a[j])
	}
	union := strings.Join(alph, "")
	for len(out) < length {
		j, _ := RandomIndex(len(union), nextByte)
		out = append(out, union[j])
	}
	for i := len(out) - 1; i > 0; i-- {
		j, _ := RandomIndex(i+1, nextByte)
		out[i], out[j] = out[j], out[i]
	}
	return string(out), nil
}

// GeneratePassphrase joins count (1..64) words drawn from at least 2 distinct non-empty words.
func GeneratePassphrase(words []string, count int, separator string, nextByte func() byte) (string, error) {
	distinct := map[string]bool{}
	for _, w := range words {
		if w == "" {
			return "", ErrPassGen
		}
		distinct[w] = true
	}
	if count < 1 || count > 64 || len(distinct) < 2 {
		return "", ErrPassGen
	}
	parts := make([]string, count)
	for i := range parts {
		j, _ := RandomIndex(len(words), nextByte)
		parts[i] = words[j]
	}
	return strings.Join(parts, separator), nil
}

// EntropyBits returns length * log2(alphabetSize) rounded to 2 decimals.
func EntropyBits(alphabetSize, length int) (float64, error) {
	if alphabetSize < 1 {
		return 0, ErrPassGen
	}
	return math.Round(float64(length)*math.Log2(float64(alphabetSize))*100) / 100, nil
}

// cryptoByte reads one byte from crypto/rand; it panics if the system CSPRNG fails.
func cryptoByte() byte {
	var b [1]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("passgen: crypto/rand failed: " + err.Error())
	}
	return b[0]
}

// Password is GeneratePassword using the crypto/rand CSPRNG (never math/rand).
func Password(length int, classes []string, excludeAmbiguous bool) (string, error) {
	return GeneratePassword(length, classes, cryptoByte, excludeAmbiguous)
}

// Passphrase is GeneratePassphrase using the crypto/rand CSPRNG (never math/rand).
func Passphrase(words []string, count int, separator string) (string, error) {
	return GeneratePassphrase(words, count, separator, cryptoByte)
}
