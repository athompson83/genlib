// SPDX-License-Identifier: Apache-2.0

// Package totp implements HOTP (RFC 4226) and TOTP (RFC 6238) one-time
// passwords, base32 secrets and otpauth:// provisioning URIs using only the
// Go standard library. It holds no global state and performs no network I/O.
package totp

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"fmt"
	"hash"
	"strconv"
	"strings"
)

// Algorithm names the HMAC hash used for code generation.
type Algorithm string

// Supported algorithms.
const (
	SHA1   Algorithm = "SHA1"
	SHA256 Algorithm = "SHA256"
	SHA512 Algorithm = "SHA512"
)

// Defaults used when an Options field is zero.
const (
	DefaultDigits = 6
	DefaultStep   = 30
)

// Options configures TOTP generation and verification. Zero values select
// 6 digits, a 30 second step, SHA1 and T0 = 0.
type Options struct {
	Digits    int
	Step      int64
	Algorithm Algorithm
	T0        int64
}

var (
	ErrInvalidDigits    = errors.New("totp: digits must be between 6 and 8")
	ErrInvalidAlgorithm = errors.New("totp: unsupported algorithm")
	ErrInvalidStep      = errors.New("totp: step must be positive")
	ErrInvalidTime      = errors.New("totp: time is before T0")
	ErrEmptySecret      = errors.New("totp: secret must not be empty")
	ErrInvalidBase32    = errors.New("totp: invalid base32 input")
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

func (o Options) normalized() (Options, error) {
	if o.Digits == 0 {
		o.Digits = DefaultDigits
	}
	if o.Step == 0 {
		o.Step = DefaultStep
	}
	if o.Algorithm == "" {
		o.Algorithm = SHA1
	}
	if o.Digits < 6 || o.Digits > 8 {
		return o, ErrInvalidDigits
	}
	if o.Step < 0 {
		return o, ErrInvalidStep
	}
	if _, err := hasher(o.Algorithm); err != nil {
		return o, err
	}
	return o, nil
}

func hasher(a Algorithm) (func() hash.Hash, error) {
	switch a {
	case SHA1:
		return sha1.New, nil
	case SHA256:
		return sha256.New, nil
	case SHA512:
		return sha512.New, nil
	}
	return nil, ErrInvalidAlgorithm
}

// HOTP returns the RFC 4226 code for counter, zero-padded to digits.
func HOTP(secret []byte, counter uint64, digits int, algorithm Algorithm) (string, error) {
	if len(secret) == 0 {
		return "", ErrEmptySecret
	}
	if digits < 6 || digits > 8 {
		return "", ErrInvalidDigits
	}
	newHash, err := hasher(algorithm)
	if err != nil {
		return "", err
	}
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], counter)
	mac := hmac.New(newHash, secret)
	mac.Write(msg[:])
	sum := mac.Sum(nil)
	offset := sum[len(sum)-1] & 0x0f
	bin := binary.BigEndian.Uint32(sum[offset:offset+4]) & 0x7fffffff
	mod := uint32(1)
	for i := 0; i < digits; i++ {
		mod *= 10
	}
	return fmt.Sprintf("%0*d", digits, bin%mod), nil
}

func counterAt(unixSeconds int64, o Options) (uint64, error) {
	if unixSeconds < o.T0 {
		return 0, ErrInvalidTime
	}
	return uint64((unixSeconds - o.T0) / o.Step), nil
}

// TOTP returns the RFC 6238 code for unixSeconds.
func TOTP(secret []byte, unixSeconds int64, opts Options) (string, error) {
	o, err := opts.normalized()
	if err != nil {
		return "", err
	}
	counter, err := counterAt(unixSeconds, o)
	if err != nil {
		return "", err
	}
	return HOTP(secret, counter, o.Digits, o.Algorithm)
}

// Verify reports whether code matches any counter within ±window steps of
// unixSeconds. Codes with the wrong length or non-digit characters are
// rejected. Every candidate is compared in constant time.
func Verify(code string, secret []byte, unixSeconds int64, window int, opts Options) bool {
	o, err := opts.normalized()
	if err != nil || window < 0 || window > 10 || len(code) != o.Digits {
		return false
	}
	for i := 0; i < len(code); i++ {
		if code[i] < '0' || code[i] > '9' {
			return false
		}
	}
	counter, err := counterAt(unixSeconds, o)
	if err != nil {
		return false
	}
	match := 0
	for d := -window; d <= window; d++ {
		if d < 0 && counter < uint64(-d) {
			continue
		}
		candidate, err := HOTP(secret, uint64(int64(counter)+int64(d)), o.Digits, o.Algorithm)
		if err != nil {
			return false
		}
		match |= subtle.ConstantTimeCompare([]byte(candidate), []byte(code))
	}
	return match == 1
}

// Base32Encode encodes data with the RFC 4648 alphabet and no padding.
func Base32Encode(data []byte) string {
	return b32.EncodeToString(data)
}

// Base32Decode decodes RFC 4648 base32 case-insensitively, ignoring spaces,
// hyphens and trailing '=' padding.
func Base32Decode(s string) ([]byte, error) {
	cleaned := strings.NewReplacer(" ", "", "-", "").Replace(strings.ToUpper(s))
	cleaned = strings.TrimRight(cleaned, "=")
	out, err := b32.DecodeString(cleaned)
	if err != nil {
		return nil, ErrInvalidBase32
	}
	return out, nil
}

// GenerateSecret returns n random bytes from crypto/rand (n <= 0 selects 20).
func GenerateSecret(n int) ([]byte, error) {
	if n <= 0 {
		n = 20
	}
	if n > 1024 {
		return nil, errors.New("totp: secret length too large")
	}
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return nil, fmt.Errorf("totp: random source failed: %w", err)
	}
	return b, nil
}

// OtpauthURI builds an otpauth://totp provisioning URI. digits 0 selects 6,
// period 0 selects 30 and an empty algorithm selects SHA1.
func OtpauthURI(issuer, account, secretBase32 string, digits int, period int64, algorithm Algorithm) (string, error) {
	o, err := Options{Digits: digits, Step: period, Algorithm: algorithm}.normalized()
	if err != nil {
		return "", err
	}
	if issuer == "" || account == "" || strings.Contains(issuer, ":") || strings.Contains(account, ":") {
		return "", errors.New("totp: issuer and account must be non-empty and must not contain ':'")
	}
	if _, err := Base32Decode(secretBase32); err != nil || secretBase32 == "" {
		return "", ErrInvalidBase32
	}
	return "otpauth://totp/" + percentEncode(issuer) + ":" + percentEncode(account) +
		"?secret=" + secretBase32 +
		"&issuer=" + percentEncode(issuer) +
		"&algorithm=" + string(o.Algorithm) +
		"&digits=" + strconv.Itoa(o.Digits) +
		"&period=" + strconv.FormatInt(o.Step, 10), nil
}

// percentEncode keeps RFC 3986 unreserved bytes and encodes everything else
// as %XX (spaces become %20).
func percentEncode(s string) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&15])
		}
	}
	return b.String()
}
