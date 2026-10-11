// SPDX-License-Identifier: Apache-2.0

// Package bloom implements a Bloom filter with deterministic FNV-1a 64-bit
// double hashing, so filters built in any Genlib language serialize to the
// same bytes.
//
// Position i of an item is (h1 + i*h2) mod m in unsigned 64-bit arithmetic,
// where h is FNV-1a 64 of the item's UTF-8 bytes, h1 its low 32 bits and h2
// its high 32 bits. Bit j lives in byte j>>3 at mask 1<<(j&7); the serialized
// form is unpadded base64url of the ceil(m/8) bytes.
package bloom

import (
	"encoding/base64"
	"errors"
	"math"
	"math/bits"
)

// ErrBloom is returned for invalid sizes, parameters or serialized state.
var ErrBloom = errors.New("bloom: invalid parameters")

// Fnv1a64 returns the FNV-1a 64-bit hash of data.
func Fnv1a64(data []byte) uint64 {
	h := uint64(0xcbf29ce484222325)
	for _, b := range data {
		h ^= uint64(b)
		h *= 0x100000001b3
	}
	return h
}

// BloomSizeFor returns the bit count m (at least 8) and hash count k for n
// items at false-positive rate p.
func BloomSizeFor(n int, p float64) (m, k int, err error) {
	if n < 1 || !(p > 0 && p < 1) {
		return 0, 0, ErrBloom
	}
	m = int(math.Ceil(-float64(n) * math.Log(p) / (math.Ln2 * math.Ln2)))
	if m < 8 {
		m = 8
	}
	k = int(math.Floor(float64(m)/float64(n)*math.Ln2 + 0.5))
	if k < 1 {
		k = 1
	}
	return m, k, nil
}

// BloomFilter is a fixed-size Bloom filter of m bits and k hashes.
type BloomFilter struct {
	m, k int
	bits []byte
}

// New returns an empty filter; m must be at least 8 and k in 1..64.
func New(m, k int) (*BloomFilter, error) {
	if m < 8 || k < 1 || k > 64 {
		return nil, ErrBloom
	}
	return &BloomFilter{m: m, k: k, bits: make([]byte, (m+7)/8)}, nil
}

// M returns the number of bits.
func (f *BloomFilter) M() int { return f.m }

// K returns the number of hash positions per item.
func (f *BloomFilter) K() int { return f.k }

func (f *BloomFilter) positions(item string) []int {
	h := Fnv1a64([]byte(item))
	h1, h2 := h&0xffffffff, h>>32
	out := make([]int, f.k)
	for i := range out {
		out[i] = int((h1 + uint64(i)*h2) % uint64(f.m))
	}
	return out
}

// Add records item in the filter.
func (f *BloomFilter) Add(item string) {
	for _, j := range f.positions(item) {
		f.bits[j>>3] |= 1 << (j & 7)
	}
}

// MightContain reports whether all of item's bits are set (false means
// definitely absent).
func (f *BloomFilter) MightContain(item string) bool {
	for _, j := range f.positions(item) {
		if f.bits[j>>3]&(1<<(j&7)) == 0 {
			return false
		}
	}
	return true
}

// CountEstimate estimates the number of distinct items added; ok is false
// when every bit is set (saturated).
func (f *BloomFilter) CountEstimate() (n int, ok bool) {
	x := 0
	for _, b := range f.bits {
		x += bits.OnesCount8(b)
	}
	if x >= f.m {
		return 0, false
	}
	m := float64(f.m)
	return int(math.Floor(-m/float64(f.k)*math.Log(1-float64(x)/m) + 0.5)), true
}

// Serialize returns the bit array as unpadded base64url.
func (f *BloomFilter) Serialize() string {
	return base64.RawURLEncoding.EncodeToString(f.bits)
}

// Deserialize rebuilds a filter from Serialize output, rejecting a wrong length.
func Deserialize(m, k int, text string) (*BloomFilter, error) {
	f, err := New(m, k)
	if err != nil {
		return nil, err
	}
	raw, err := base64.RawURLEncoding.DecodeString(text)
	if err != nil || len(raw) != len(f.bits) {
		return nil, ErrBloom
	}
	f.bits = raw
	return f, nil
}

// Union returns a new filter holding the members of both; m and k must match.
func (f *BloomFilter) Union(other *BloomFilter) (*BloomFilter, error) {
	if f.m != other.m || f.k != other.k {
		return nil, ErrBloom
	}
	out, _ := New(f.m, f.k)
	for i := range out.bits {
		out.bits[i] = f.bits[i] | other.bits[i]
	}
	return out, nil
}
