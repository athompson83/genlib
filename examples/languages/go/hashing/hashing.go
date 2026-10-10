// SPDX-License-Identifier: Apache-2.0

// Package hashing provides fast NON-cryptographic hashes for checksums, hash
// tables, sharding and bucketing: CRC-32 (IEEE), FNV-1a 32/64, MurmurHash3
// x86_32 and jump consistent hashing. Never use them for passwords, MACs,
// signatures or anything an attacker must not be able to forge or collide.
package hashing

import "errors"

var crcTable = func() (t [256]uint32) {
	for i := range t {
		c := uint32(i)
		for k := 0; k < 8; k++ {
			if c&1 != 0 {
				c = 0xEDB88320 ^ c>>1
			} else {
				c >>= 1
			}
		}
		t[i] = c
	}
	return
}()

// CRC32 is the IEEE 802.3 CRC-32 (reflected, polynomial 0xEDB88320).
func CRC32(data []byte) uint32 {
	c := ^uint32(0)
	for _, b := range data {
		c = crcTable[byte(c)^b] ^ c>>8
	}
	return ^c
}

// FNV1a32 is the 32-bit FNV-1a hash.
func FNV1a32(data []byte) uint32 {
	h := uint32(0x811c9dc5)
	for _, b := range data {
		h = (h ^ uint32(b)) * 0x01000193
	}
	return h
}

// FNV1a64 is the 64-bit FNV-1a hash.
func FNV1a64(data []byte) uint64 {
	h := uint64(0xcbf29ce484222325)
	for _, b := range data {
		h = (h ^ uint64(b)) * 0x100000001b3
	}
	return h
}

func rotl(x uint32, r uint) uint32 { return x<<r | x>>(32-r) }

// Murmur3x86_32 is MurmurHash3 x86_32 over little-endian 4-byte blocks.
func Murmur3x86_32(data []byte, seed uint32) uint32 {
	const c1, c2 = 0xcc9e2d51, 0x1b873593
	h := seed
	n := len(data)
	body := n - n%4
	for i := 0; i < body; i += 4 {
		k := uint32(data[i]) | uint32(data[i+1])<<8 | uint32(data[i+2])<<16 | uint32(data[i+3])<<24
		k = rotl(k*c1, 15) * c2
		h = rotl(h^k, 13)*5 + 0xe6546b64
	}
	if n > body {
		k := uint32(0)
		for i, b := range data[body:] {
			k |= uint32(b) << (8 * uint(i))
		}
		h ^= rotl(k*c1, 15) * c2
	}
	h ^= uint32(n)
	h ^= h >> 16
	h *= 0x85ebca6b
	h ^= h >> 13
	h *= 0xc2b2ae35
	h ^= h >> 16
	return h
}

// JumpHash maps key to a bucket in [0, buckets) with Lamping and Veach's jump
// consistent hash: growing buckets from n to n+1 moves only about 1/(n+1) of
// the keys. buckets must be in 1..2^31-1.
func JumpHash(key uint64, buckets int64) (int64, error) {
	if buckets < 1 || buckets > 1<<31-1 {
		return 0, errors.New("hashing: buckets must be in 1..2^31-1")
	}
	b, j := int64(-1), int64(0)
	for j < buckets {
		b = j
		key = key*2862933555777941757 + 1
		j = int64(float64(b+1) * (float64(int64(1)<<31) / float64(key>>33+1)))
	}
	return b, nil
}
