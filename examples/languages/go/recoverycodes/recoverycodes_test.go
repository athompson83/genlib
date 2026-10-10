// SPDX-License-Identifier: Apache-2.0

package recoverycodes

import (
	"regexp"
	"testing"
)

func TestNormalize(t *testing.T) {
	for in, want := range map[string]string{" 7k3qx-9mnp2 ": "7K3QX9MNP2", "ABCDE-FGHIO": "ABCDEFGH10"} {
		got, err := Normalize(in, DefaultFormat)
		if err != nil || got != want {
			t.Fatalf("%q: got %q err %v", in, got, err)
		}
	}
	for _, bad := range []string{"ABCDE-FGHIU", "ABC", "ABCDE-FGHÉ1"} {
		if _, err := Normalize(bad, DefaultFormat); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestHash(t *testing.T) {
	// Cross-checked with Python hmac.new(b'pepper', b'7K3QX9MNP2', hashlib.sha256).hexdigest().
	const want = "b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138"
	got, err := Hash("7K3QX-9MNP2", []byte("pepper"), DefaultFormat)
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
	if _, err := Hash("7K3QX-9MNP2", nil, DefaultFormat); err == nil {
		t.Fatal("accepted empty key")
	}
}

func TestGenerateAndFind(t *testing.T) {
	codes, err := Generate(10, DefaultFormat)
	if err != nil || len(codes) != 10 {
		t.Fatalf("got %d codes err %v", len(codes), err)
	}
	re := regexp.MustCompile(`^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$`)
	seen := map[string]bool{}
	for _, c := range codes {
		if !re.MatchString(c) || seen[c] {
			t.Fatalf("bad or duplicate code %q", c)
		}
		seen[c] = true
	}
	key := []byte("pepper")
	hashes := make([]string, 3)
	for i := range hashes {
		hashes[i], _ = Hash(codes[i], key, DefaultFormat)
	}
	if got := Find(codes[2], hashes, key, DefaultFormat); got != 2 {
		t.Fatalf("Find returned %d", got)
	}
	if got := Find(codes[5], hashes, key, DefaultFormat); got != -1 {
		t.Fatalf("unknown code returned %d", got)
	}
	if got := Find("bad", hashes, key, DefaultFormat); got != -1 {
		t.Fatalf("invalid code returned %d", got)
	}
}
