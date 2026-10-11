// SPDX-License-Identifier: Apache-2.0

// Package base58 implements Base58 with the Bitcoin alphabet and Base58Check
// (payload plus the first 4 bytes of SHA-256(SHA-256(payload))). The number
// conversion works directly on byte slices, so no big-integer type is needed.
// Leading zero bytes map to leading '1' characters and back.
package base58

import (
	"bytes"
	"crypto/sha256"
	"errors"
)

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// ErrBase58 is wrapped by every decoding error.
var ErrBase58 = errors.New("base58: invalid input")

type b58Error struct{ msg string }

func (e *b58Error) Error() string { return "base58: " + e.msg }
func (e *b58Error) Unwrap() error { return ErrBase58 }

// Encode returns the Base58 text for b; an empty slice encodes to "".
func Encode(b []byte) string {
	zeros := 0
	for zeros < len(b) && b[zeros] == 0 {
		zeros++
	}
	var digits []byte // base 58, little-endian
	for _, v := range b[zeros:] {
		carry := int(v)
		for j := range digits {
			carry += int(digits[j]) << 8
			digits[j] = byte(carry % 58)
			carry /= 58
		}
		for carry > 0 {
			digits = append(digits, byte(carry%58))
			carry /= 58
		}
	}
	out := make([]byte, 0, zeros+len(digits))
	for i := 0; i < zeros; i++ {
		out = append(out, '1')
	}
	for i := len(digits) - 1; i >= 0; i-- {
		out = append(out, alphabet[digits[i]])
	}
	return string(out)
}

// Decode parses Base58 text; any character outside the alphabet is an error and "" decodes to an empty slice.
func Decode(s string) ([]byte, error) {
	zeros := 0
	for zeros < len(s) && s[zeros] == '1' {
		zeros++
	}
	var body []byte // base 256, little-endian
	for _, c := range s {
		idx := -1
		if c < 0x80 {
			idx = bytes.IndexByte([]byte(alphabet), byte(c))
		}
		if idx < 0 {
			return nil, &b58Error{"invalid base58 character"}
		}
		carry := idx
		for j := range body {
			carry += int(body[j]) * 58
			body[j] = byte(carry & 0xff)
			carry >>= 8
		}
		for carry > 0 {
			body = append(body, byte(carry&0xff))
			carry >>= 8
		}
	}
	out := make([]byte, zeros, zeros+len(body))
	for i := len(body) - 1; i >= 0; i-- {
		out = append(out, body[i])
	}
	return out, nil
}

func checksum(p []byte) []byte {
	first := sha256.Sum256(p)
	second := sha256.Sum256(first[:])
	return second[:4]
}

// CheckEncode returns Base58(payload + 4-byte double SHA-256 checksum).
func CheckEncode(payload []byte) string {
	buf := append(append([]byte{}, payload...), checksum(payload)...)
	return Encode(buf)
}

// CheckDecode decodes Base58Check text, verifies the checksum and returns the payload.
func CheckDecode(s string) ([]byte, error) {
	b, err := Decode(s)
	if err != nil {
		return nil, err
	}
	if len(b) < 4 {
		return nil, &b58Error{"too short for a checksum"}
	}
	p, c := b[:len(b)-4], b[len(b)-4:]
	if !bytes.Equal(checksum(p), c) {
		return nil, &b58Error{"checksum mismatch"}
	}
	return p, nil
}
