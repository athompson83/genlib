// SPDX-License-Identifier: Apache-2.0

// Package passwords hashes passwords with Argon2id from golang.org/x/crypto.
// x/crypto supplies the KDF only, so this file adds the PHC string format
// ($argon2id$v=19$m=...,t=...,p=...$salt$hash) used by other languages.
// Parameters: OWASP Password Storage Cheat Sheet minimum m=19456 KiB, t=2, p=1.
package passwords

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

type Params struct {
	MemoryKiB uint32
	Time      uint32
	Threads   uint8
	SaltLen   uint32
	KeyLen    uint32
}

var Default = Params{MemoryKiB: 19456, Time: 2, Threads: 1, SaltLen: 16, KeyLen: 32}

var b64 = base64.RawStdEncoding

var ErrInvalidHash = errors.New("passwords: invalid hash")

func Hash(password string) (string, error) { return HashWith(password, Default) }

func HashWith(password string, p Params) (string, error) {
	salt := make([]byte, p.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, p.Time, p.MemoryKiB, p.Threads, p.KeyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, p.MemoryKiB, p.Time, p.Threads, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// decode parses an argon2id PHC string. Parameters may appear in any order.
func decode(encoded string) (Params, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != fmt.Sprintf("v=%d", argon2.Version) {
		return Params{}, nil, nil, ErrInvalidHash
	}
	var p Params
	seen := 0
	for _, kv := range strings.Split(parts[3], ",") {
		var v uint32
		k, val, ok := strings.Cut(kv, "=")
		if !ok {
			return Params{}, nil, nil, ErrInvalidHash
		}
		if _, err := fmt.Sscanf(val, "%d", &v); err != nil {
			return Params{}, nil, nil, ErrInvalidHash
		}
		switch k {
		case "m":
			p.MemoryKiB = v
		case "t":
			p.Time = v
		case "p":
			if v == 0 || v > 255 {
				return Params{}, nil, nil, ErrInvalidHash
			}
			p.Threads = uint8(v)
		default:
			return Params{}, nil, nil, ErrInvalidHash
		}
		seen++
	}
	salt, err1 := b64.DecodeString(parts[4])
	key, err2 := b64.DecodeString(parts[5])
	if seen != 3 || err1 != nil || err2 != nil || len(salt) < 8 || len(key) < 16 ||
		p.Time == 0 || p.MemoryKiB < 8*uint32(p.Threads) || p.MemoryKiB > 4<<20 {
		return Params{}, nil, nil, ErrInvalidHash
	}
	p.SaltLen, p.KeyLen = uint32(len(salt)), uint32(len(key))
	return p, salt, key, nil
}

// Verify reports whether password matches stored. When ok and rehash != "",
// persist rehash: the stored value was bcrypt or used weaker parameters.
func Verify(stored, password string) (ok bool, rehash string, err error) {
	if strings.HasPrefix(stored, "$2a$") || strings.HasPrefix(stored, "$2b$") || strings.HasPrefix(stored, "$2y$") {
		if bcrypt.CompareHashAndPassword([]byte(stored), []byte(password)) != nil {
			return false, "", nil
		}
		rehash, err = Hash(password)
		return err == nil, rehash, err
	}
	p, salt, key, err := decode(stored)
	if err != nil {
		return false, "", err
	}
	got := argon2.IDKey([]byte(password), salt, p.Time, p.MemoryKiB, p.Threads, p.KeyLen)
	if subtle.ConstantTimeCompare(got, key) != 1 {
		return false, "", nil
	}
	if p.MemoryKiB < Default.MemoryKiB || p.Time < Default.Time || p.KeyLen < Default.KeyLen {
		rehash, err = Hash(password)
		return err == nil, rehash, err
	}
	return true, "", nil
}

// BcryptHash is a fallback where Argon2 is not allowed (FIPS policy, etc.).
// OWASP: cost >= 10. bcrypt rejects inputs over 72 bytes (x/crypto >= v0.25).
func BcryptHash(password string, cost int) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), cost)
	return string(h), err
}
