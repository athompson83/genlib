// SPDX-License-Identifier: Apache-2.0

package hashing

import (
	"fmt"
	"testing"
)

func TestStrings(t *testing.T) {
	for _, c := range []struct {
		s              string
		crc, fnv32     uint32
		fnv64          string
		murmur0, mur42 uint32
	}{
		{"", 0, 2166136261, "cbf29ce484222325", 0, 142593372},
		{"a", 3904355907, 3826002220, "af63dc4c8601ec8c", 1009084850, 3001393763},
		{"foobar", 2666930069, 3214735720, "85944171f73967e8", 2764362941, 1018276128},
		{"123456789", 3421780262, 3146166556, "06d5573923c6cdfc", 3036607362, 3059026825},
		{"hello", 907060870, 1335831723, "a430d84680aabd0b", 613153351, 3806057185},
		{"The quick brown fox jumps over the lazy dog", 1095738169, 76545936, "f3f9b7f5e7e47110", 776992547, 880582914},
		{"héllo wörld", 354246585, 3558752674, "11824ab841812022", 2549609076, 857211688},
	} {
		b := []byte(c.s)
		if got := CRC32(b); got != c.crc {
			t.Errorf("CRC32(%q) = %d, want %d", c.s, got, c.crc)
		}
		if got := FNV1a32(b); got != c.fnv32 {
			t.Errorf("FNV1a32(%q) = %d, want %d", c.s, got, c.fnv32)
		}
		if got := fmt.Sprintf("%016x", FNV1a64(b)); got != c.fnv64 {
			t.Errorf("FNV1a64(%q) = %s, want %s", c.s, got, c.fnv64)
		}
		if got := Murmur3x86_32(b, 0); got != c.murmur0 {
			t.Errorf("Murmur3(%q, 0) = %d, want %d", c.s, got, c.murmur0)
		}
		if got := Murmur3x86_32(b, 42); got != c.mur42 {
			t.Errorf("Murmur3(%q, 42) = %d, want %d", c.s, got, c.mur42)
		}
	}
	if CRC32([]byte("123456789")) != 0xCBF43926 || Murmur3x86_32(nil, 1) != 0x514E28B7 {
		t.Error("published check values")
	}
}

func TestJump(t *testing.T) {
	for _, c := range []struct {
		key           uint64
		buckets, want int64
	}{
		{0, 1, 0}, {1, 10, 6}, {256, 1024, 520}, {3735928559, 100, 87},
		{18446744073709551615, 1000, 313}, {12345678901234567, 7, 5}, {42, 2147483647, 1603940301},
	} {
		if got, err := JumpHash(c.key, c.buckets); err != nil || got != c.want {
			t.Errorf("JumpHash(%d, %d) = %d, %v; want %d", c.key, c.buckets, got, err, c.want)
		}
	}
	for _, n := range []int64{0, -1, 1 << 31} {
		if _, err := JumpHash(1, n); err == nil {
			t.Errorf("JumpHash(1, %d) want error", n)
		}
	}
}
