// SPDX-License-Identifier: Apache-2.0

// Package baseenc implements strict Base32 (RFC 4648 sections 6 and 7),
// Base58 (Bitcoin alphabet) and unpadded Base64url (RFC 4648 section 5).
// Decoders reject unknown characters, bad padding or length and non-canonical
// trailing bits, so every accepted text has exactly one byte value.
package baseenc

import (
	"errors"
	"strings"
)

// Alphabet selects the Base32 alphabet.
type Alphabet int

const (
	// RFC4648 is the standard alphabet A-Z 2-7 (section 6).
	RFC4648 Alphabet = iota
	// Hex is the extended hex alphabet 0-9 A-V (section 7).
	Hex
)

const (
	b32std = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
	b32hex = "0123456789ABCDEFGHIJKLMNOPQRSTUV"
	b58    = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	b64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
)

func (a Alphabet) chars() string {
	if a == Hex {
		return b32hex
	}
	return b32std
}

// Base32Encode returns uppercase Base32, padded with "=" to a multiple of 8
// characters when padding is true.
func Base32Encode(data []byte, alphabet Alphabet, padding bool) string {
	chars := alphabet.chars()
	var b strings.Builder
	bits, n := uint(0), uint(0)
	for _, c := range data {
		bits = bits<<8 | uint(c)
		n += 8
		for n >= 5 {
			n -= 5
			b.WriteByte(chars[(bits>>n)&31])
		}
		bits &= 1<<n - 1
	}
	if n > 0 {
		b.WriteByte(chars[(bits<<(5-n))&31])
	}
	if padding {
		for b.Len()%8 != 0 {
			b.WriteByte('=')
		}
	}
	return b.String()
}

// Base32Decode decodes case-insensitive Base32. With padding the length must
// be a multiple of 8 with 0, 1, 3, 4 or 6 "="; without padding no "=" is
// allowed. Unpadded lengths of 1, 3 or 6 (mod 8) and non-zero leftover bits
// are rejected.
func Base32Decode(text string, alphabet Alphabet, padding bool) ([]byte, error) {
	t := text
	if padding {
		if len(t)%8 != 0 {
			return nil, errors.New("baseenc: padded base32 length must be a multiple of 8")
		}
		stripped := strings.TrimRight(t, "=")
		switch len(t) - len(stripped) {
		case 0, 1, 3, 4, 6:
		default:
			return nil, errors.New("baseenc: invalid base32 padding")
		}
		t = stripped
	} else if strings.Contains(t, "=") {
		return nil, errors.New("baseenc: unexpected base32 padding")
	}
	switch len(t) % 8 {
	case 1, 3, 6:
		return nil, errors.New("baseenc: invalid base32 length")
	}
	chars := alphabet.chars()
	out := make([]byte, 0, len(t)*5/8)
	bits, n := uint(0), uint(0)
	for i := 0; i < len(t); i++ {
		c := t[i]
		if c >= 'a' && c <= 'z' {
			c -= 'a' - 'A'
		}
		v := strings.IndexByte(chars, c)
		if v < 0 {
			return nil, errors.New("baseenc: invalid base32 character")
		}
		bits = bits<<5 | uint(v)
		n += 5
		if n >= 8 {
			n -= 8
			out = append(out, byte(bits>>n))
		}
		bits &= 1<<n - 1
	}
	if bits != 0 {
		return nil, errors.New("baseenc: non-canonical base32 trailing bits")
	}
	return out, nil
}

// Base58Encode encodes with the Bitcoin alphabet; each leading zero byte
// becomes one leading "1".
func Base58Encode(data []byte) string {
	zeros := 0
	for zeros < len(data) && data[zeros] == 0 {
		zeros++
	}
	// digits holds base-58 digits, least significant first.
	var digits []byte
	for _, c := range data[zeros:] {
		carry := int(c)
		for k := range digits {
			carry += int(digits[k]) << 8
			digits[k] = byte(carry % 58)
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
	for k := len(digits) - 1; k >= 0; k-- {
		out = append(out, b58[digits[k]])
	}
	return string(out)
}

// Base58Decode decodes Bitcoin-alphabet Base58; each leading "1" becomes one
// leading zero byte. Characters outside the alphabet (0, O, I, l, ...) fail.
func Base58Decode(text string) ([]byte, error) {
	zeros := 0
	for zeros < len(text) && text[zeros] == '1' {
		zeros++
	}
	// body holds bytes, least significant first.
	var body []byte
	for i := 0; i < len(text); i++ {
		v := strings.IndexByte(b58, text[i])
		if v < 0 {
			return nil, errors.New("baseenc: invalid base58 character")
		}
		carry := v
		for k := range body {
			carry += int(body[k]) * 58
			body[k] = byte(carry)
			carry >>= 8
		}
		for carry > 0 {
			body = append(body, byte(carry))
			carry >>= 8
		}
	}
	out := make([]byte, zeros, zeros+len(body))
	for k := len(body) - 1; k >= 0; k-- {
		out = append(out, body[k])
	}
	return out, nil
}

// Base64URLEncode encodes with the URL-safe alphabet and no padding.
func Base64URLEncode(data []byte) string {
	var b strings.Builder
	bits, n := uint(0), uint(0)
	for _, c := range data {
		bits = bits<<8 | uint(c)
		n += 8
		for n >= 6 {
			n -= 6
			b.WriteByte(b64url[(bits>>n)&63])
		}
		bits &= 1<<n - 1
	}
	if n > 0 {
		b.WriteByte(b64url[(bits<<(6-n))&63])
	}
	return b.String()
}

// Base64URLDecode decodes unpadded Base64url. It rejects "=", "+", "/" and
// any other character outside the alphabet, a length of 1 (mod 4) and
// non-zero trailing bits.
func Base64URLDecode(text string) ([]byte, error) {
	if len(text)%4 == 1 {
		return nil, errors.New("baseenc: invalid base64url length")
	}
	out := make([]byte, 0, len(text)*3/4)
	bits, n := uint(0), uint(0)
	for i := 0; i < len(text); i++ {
		v := strings.IndexByte(b64url, text[i])
		if v < 0 {
			return nil, errors.New("baseenc: invalid base64url character")
		}
		bits = bits<<6 | uint(v)
		n += 6
		if n >= 8 {
			n -= 8
			out = append(out, byte(bits>>n))
		}
		bits &= 1<<n - 1
	}
	if bits != 0 {
		return nil, errors.New("baseenc: non-canonical base64url trailing bits")
	}
	return out, nil
}
