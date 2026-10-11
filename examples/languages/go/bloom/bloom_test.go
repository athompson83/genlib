// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package bloom

import (
	"errors"
	"reflect"
	"testing"
)

func TestFnv1a64(t *testing.T) {
	for _, c := range []struct {
		in   string
		want uint64
	}{
		{"apple", 0xf74a62a458befdbf},
		{"banana", 0xb4d3b6b1c372c890},
		{"", 0xcbf29ce484222325},
		{"caf\u00e9", 0x48e8823acfa40d89},
		{"\U0001f600", 0xfeff073875020288},
		{"user:42", 0x6c151ea4dcd221c2},
		{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 0x060324515a7b4e27},
	} {
		if got := Fnv1a64([]byte(c.in)); got != c.want {
			t.Errorf("Fnv1a64(%q) = %x; want %x", c.in, got, c.want)
		}
	}
}

func TestBloomSizeFor(t *testing.T) {
	for _, c := range []struct {
		n    int
		p    float64
		m, k int
	}{
		{1, 0.5, 8, 6},
		{10, 0.01, 96, 7},
		{100, 0.01, 959, 7},
		{1000, 0.001, 14378, 10},
		{5000, 0.05, 31177, 4},
		{3, 0.3, 8, 2},
	} {
		m, k, err := BloomSizeFor(c.n, c.p)
		if err != nil || m != c.m || k != c.k {
			t.Errorf("BloomSizeFor(%d, %v) = %d, %d, %v; want %d, %d", c.n, c.p, m, k, err, c.m, c.k)
		}
	}
	for _, c := range []struct {
		n int
		p float64
	}{{0, 0.1}, {10, 0.0}, {10, 1.0}, {10, 1.5}} {
		if _, _, err := BloomSizeFor(c.n, c.p); !errors.Is(err, ErrBloom) {
			t.Errorf("BloomSizeFor(%d, %v) should fail", c.n, c.p)
		}
	}
}

func TestBloomFilter(t *testing.T) {
	f, err := New(256, 5)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		item string
		want []int
	}{
		{"apple", []int{191, 99, 7, 171, 79}},
		{"banana", []int{144, 65, 242, 163, 84}},
		{"", []int{37, 9, 237, 209, 181}},
		{"caf\u00e9", []int{137, 195, 253, 55, 113}},
		{"\U0001f600", []int{136, 192, 248, 48, 104}},
		{"user:42", []int{194, 102, 10, 174, 82}},
		{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", []int{39, 120, 201, 26, 107}},
	} {
		if got := f.positions(c.item); !reflect.DeepEqual(got, c.want) {
			t.Errorf("positions(%q) = %v; want %v", c.item, got, c.want)
		}
	}
	for _, s := range []string{"apple", "banana", "", "caf\u00e9", "\U0001f600"} {
		f.Add(s)
	}
	if got := f.Serialize(); got != "gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE" {
		t.Errorf("Serialize() = %q", got)
	}
	for _, c := range []struct {
		item string
		want bool
	}{
		{"apple", true},
		{"banana", true},
		{"", true},
		{"caf\u00e9", true},
		{"\U0001f600", true},
		{"cherry", false},
		{"user:42", false},
		{"zzz", false},
		{"Apple", false},
	} {
		if got := f.MightContain(c.item); got != c.want {
			t.Errorf("MightContain(%q) = %v", c.item, got)
		}
	}
	if n, ok := f.CountEstimate(); !ok || n != 5 {
		t.Errorf("CountEstimate() = %d, %v", n, ok)
	}
	g, err := Deserialize(256, 5, f.Serialize())
	if err != nil || g.Serialize() != f.Serialize() || !g.MightContain("apple") {
		t.Errorf("Deserialize round trip failed: %v", err)
	}
	cherry, _ := New(256, 5)
	cherry.Add("cherry")
	u, err := f.Union(cherry)
	if err != nil || u.Serialize() != "gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE" {
		t.Errorf("Union = %v", err)
	}
	if n, ok := u.CountEstimate(); !ok || n != 6 || !u.MightContain("cherry") {
		t.Errorf("union CountEstimate() = %d, %v", n, ok)
	}
	other, _ := New(264, 5)
	if _, err := f.Union(other); err == nil {
		t.Error("Union with different m should fail")
	}
	if _, err := Deserialize(256, 5, "AAAA"); err == nil {
		t.Error("Deserialize with wrong length should fail")
	}
	full, _ := New(8, 1)
	for i := 0; i < 400; i++ {
		full.Add(string(rune('a' + i)))
	}
	if _, ok := full.CountEstimate(); ok {
		t.Error("saturated filter should have no estimate")
	}
	if _, err := New(7, 1); err == nil {
		t.Error("New(7, 1) should fail")
	}
}
