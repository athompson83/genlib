// SPDX-License-Identifier: Apache-2.0

// Package recoverycodes generates, normalizes, hashes and checks MFA backup
// codes. Codes use Crockford base32 without I, L, O and U; only keyed hashes
// (HMAC-SHA256) should be stored.
package recoverycodes

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// Alphabet is Crockford base32 without I, L, O and U.
const Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// Format describes the shape of a code, for example 2 groups of 5 characters.
type Format struct {
	Groups      int
	GroupLength int
}

// DefaultFormat produces codes such as "7K3QX-9MNP2".
var DefaultFormat = Format{Groups: 2, GroupLength: 5}

var (
	ErrInvalidFormat = errors.New("recoverycodes: invalid format")
	ErrInvalidCode   = errors.New("recoverycodes: invalid recovery code")
	ErrEmptyKey      = errors.New("recoverycodes: key must not be empty")
)

func (f Format) length() (int, error) {
	if f.Groups < 1 || f.GroupLength < 1 || f.Groups*f.GroupLength > 64 {
		return 0, ErrInvalidFormat
	}
	return f.Groups * f.GroupLength, nil
}

// Generate returns count unique random codes. Each symbol comes from the low
// five bits of a random byte, so selection from the 32-symbol alphabet is unbiased.
func Generate(count int, f Format) ([]string, error) {
	n, err := f.length()
	if err != nil {
		return nil, err
	}
	if count < 1 || count > 1000 {
		return nil, errors.New("recoverycodes: count must be between 1 and 1000")
	}
	seen := make(map[string]bool, count)
	codes := make([]string, 0, count)
	buf := make([]byte, n)
	for attempts := 0; len(codes) < count; attempts++ {
		if attempts > count*100 {
			return nil, errors.New("recoverycodes: could not generate unique codes")
		}
		if _, err := rand.Read(buf); err != nil {
			return nil, fmt.Errorf("recoverycodes: random source failed: %w", err)
		}
		var b strings.Builder
		for i, r := range buf {
			if i > 0 && i%f.GroupLength == 0 {
				b.WriteByte('-')
			}
			b.WriteByte(Alphabet[r&31])
		}
		code := b.String()
		if !seen[code] {
			seen[code] = true
			codes = append(codes, code)
		}
	}
	return codes, nil
}

// Normalize uppercases input, removes spaces and hyphens, maps O to 0 and
// I/L to 1, and checks the alphabet and length.
func Normalize(input string, f Format) (string, error) {
	n, err := f.length()
	if err != nil {
		return "", err
	}
	var b strings.Builder
	for _, r := range strings.ToUpper(input) {
		switch r {
		case ' ', '-':
			continue
		case 'O':
			r = '0'
		case 'I', 'L':
			r = '1'
		}
		if r > 127 || strings.IndexByte(Alphabet, byte(r)) < 0 {
			return "", ErrInvalidCode
		}
		b.WriteRune(r)
	}
	if b.Len() != n {
		return "", ErrInvalidCode
	}
	return b.String(), nil
}

// Hash returns the lowercase hex HMAC-SHA256(key, normalized code).
func Hash(code string, key []byte, f Format) (string, error) {
	if len(key) == 0 {
		return "", ErrEmptyKey
	}
	normalized, err := Normalize(code, f)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(normalized))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// Find returns the index of the stored hash matching input, or -1. Every
// stored hash is compared in constant time without an early exit.
func Find(input string, storedHashes []string, key []byte, f Format) int {
	h, err := Hash(input, key, f)
	if err != nil {
		return -1
	}
	found := -1
	for i, stored := range storedHashes {
		eq := subtle.ConstantTimeCompare([]byte(h), []byte(strings.ToLower(stored)))
		found = subtle.ConstantTimeSelect(eq, i, found)
	}
	return found
}
