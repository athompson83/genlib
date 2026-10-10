// SPDX-License-Identifier: Apache-2.0

package passwords

import (
	"strings"
	"testing"
)

func TestHashVerify(t *testing.T) {
	h, err := Hash("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("unexpected encoding %s", h)
	}
	if ok, re, err := Verify(h, "correct horse battery staple"); !ok || re != "" || err != nil {
		t.Fatalf("verify: %v %q %v", ok, re, err)
	}
	if ok, _, _ := Verify(h, "wrong"); ok {
		t.Fatal("wrong password accepted")
	}
	h2, _ := Hash("correct horse battery staple")
	if h == h2 {
		t.Fatal("salt not random")
	}
}

func TestRehashWeakParams(t *testing.T) {
	weak, _ := HashWith("pw", Params{MemoryKiB: 8192, Time: 1, Threads: 1, SaltLen: 16, KeyLen: 32})
	ok, re, err := Verify(weak, "pw")
	if !ok || err != nil || !strings.HasPrefix(re, "$argon2id$v=19$m=19456,t=2,p=1$") {
		t.Fatalf("expected rehash, got %v %q %v", ok, re, err)
	}
}

func TestOtherParamOrderAndLibraries(t *testing.T) {
	// Produced by node-argon2 0.45.1 (m,p,t order) for password "pw".
	node := "$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA"
	if ok, re, err := Verify(node, "pw"); !ok || re != "" || err != nil {
		t.Fatalf("node-argon2 hash: %v %q %v", ok, re, err)
	}
	// Produced by argon2-cffi 25.1.0 (reference libargon2) for "pw".
	cffi := "$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc"
	if ok, re, err := Verify(cffi, "pw"); !ok || re != "" || err != nil {
		t.Fatalf("argon2-cffi hash: %v %q %v", ok, re, err)
	}
}

func TestBcryptUpgrade(t *testing.T) {
	legacy, err := BcryptHash("pw", 10)
	if err != nil {
		t.Fatal(err)
	}
	ok, re, err := Verify(legacy, "pw")
	if !ok || err != nil || !strings.HasPrefix(re, "$argon2id$") {
		t.Fatalf("bcrypt upgrade: %v %q %v", ok, re, err)
	}
	if ok, _, _ := Verify(legacy, "nope"); ok {
		t.Fatal("wrong bcrypt password accepted")
	}
	if _, err := BcryptHash(strings.Repeat("x", 73), 10); err == nil {
		t.Fatal("expected 72-byte limit error")
	}
}

func TestMalformed(t *testing.T) {
	for _, h := range []string{"", "not-a-hash", "$argon2id$v=19$m=1,t=1,p=1$AAAA$AAAA", "$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA"} {
		if ok, _, err := Verify(h, "pw"); ok || err == nil {
			t.Fatalf("accepted %q", h)
		}
	}
}
