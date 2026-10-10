// SPDX-License-Identifier: Apache-2.0

// Package ids builds and reads time-ordered identifiers: UUIDv7 (RFC 9562)
// and ULID. The deterministic builders take Unix milliseconds and ten random
// bytes; NewUUIDv7 and NewULID use the system clock and crypto/rand.
package ids

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"
)

// Crockford is the ULID base32 alphabet.
const Crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// MaxUnixMs is the largest 48-bit timestamp.
const MaxUnixMs = int64(1)<<48 - 1

func check(unixMs int64, random []byte) error {
	if unixMs < 0 || unixMs > MaxUnixMs {
		return errors.New("ids: unixMs must be in [0, 2^48-1]")
	}
	if len(random) != 10 {
		return errors.New("ids: random must be exactly 10 bytes")
	}
	return nil
}

func raw(unixMs int64, random []byte) [16]byte {
	var b [16]byte
	for i := 0; i < 6; i++ {
		b[i] = byte(unixMs >> (8 * (5 - i)))
	}
	copy(b[6:], random)
	return b
}

// UUIDv7 returns the lowercase 8-4-4-4-12 UUIDv7 for unixMs and 10 random bytes.
func UUIDv7(unixMs int64, random []byte) (string, error) {
	if err := check(unixMs, random); err != nil {
		return "", err
	}
	b := raw(unixMs, random)
	b[6] = 0x70 | b[6]&0x0F
	b[8] = 0x80 | b[8]&0x3F
	h := hex.EncodeToString(b[:])
	return h[0:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20] + "-" + h[20:], nil
}

// ULID returns the 26-character Crockford base32 encoding of (unixMs << 80) | random.
func ULID(unixMs int64, random []byte) (string, error) {
	if err := check(unixMs, random); err != nil {
		return "", err
	}
	b := raw(unixMs, random)
	out := make([]byte, 26)
	// 130 bits of output: the first character holds the top 3 bits.
	for i := 25; i >= 0; i-- {
		bit := 5 * (25 - i) // index, from the least significant end, of this group's lowest bit
		var v byte
		for k := 4; k >= 0; k-- {
			pos := bit + k
			v <<= 1
			if pos >= 0 && pos < 128 && b[15-pos/8]>>(pos%8)&1 == 1 {
				v |= 1
			}
		}
		out[i] = Crockford[v]
	}
	return string(out), nil
}

// UUIDv7Time returns the Unix milliseconds of a UUIDv7 (case-insensitive).
func UUIDv7Time(text string) (int64, error) {
	if len(text) != 36 {
		return 0, errors.New("ids: UUID must be 36 characters")
	}
	lower := strings.ToLower(text)
	for _, i := range []int{8, 13, 18, 23} {
		if lower[i] != '-' {
			return 0, errors.New("ids: UUID must use 8-4-4-4-12 dashes")
		}
	}
	digits := strings.ReplaceAll(lower, "-", "")
	b, err := hex.DecodeString(digits)
	if len(digits) != 32 || err != nil {
		return 0, errors.New("ids: UUID must be hexadecimal")
	}
	if b[6]>>4 != 7 {
		return 0, errors.New("ids: not a version 7 UUID")
	}
	if b[8]>>6 != 2 {
		return 0, errors.New("ids: UUID variant must be RFC 9562")
	}
	var ms int64
	for _, c := range b[:6] {
		ms = ms<<8 | int64(c)
	}
	return ms, nil
}

// ULIDTime returns the Unix milliseconds of a ULID (case-insensitive).
func ULIDTime(text string) (int64, error) {
	if len(text) != 26 {
		return 0, errors.New("ids: ULID must be 26 characters")
	}
	upper := strings.ToUpper(text)
	var ms int64
	for i := 0; i < 26; i++ {
		v := strings.IndexByte(Crockford, upper[i])
		if v < 0 {
			return 0, errors.New("ids: ULID must use Crockford base32")
		}
		if i == 0 && v > 7 {
			return 0, errors.New("ids: ULID overflows 128 bits")
		}
		if i < 10 {
			ms = ms*32 + int64(v)
		}
	}
	return ms, nil
}

func fresh() (int64, []byte, error) {
	random := make([]byte, 10)
	if _, err := rand.Read(random); err != nil {
		return 0, nil, err
	}
	return time.Now().UnixMilli(), random, nil
}

// NewUUIDv7 returns a UUIDv7 for the current time and CSPRNG bytes.
func NewUUIDv7() (string, error) {
	ms, random, err := fresh()
	if err != nil {
		return "", err
	}
	return UUIDv7(ms, random)
}

// NewULID returns a ULID for the current time and CSPRNG bytes.
func NewULID() (string, error) {
	ms, random, err := fresh()
	if err != nil {
		return "", err
	}
	return ULID(ms, random)
}
