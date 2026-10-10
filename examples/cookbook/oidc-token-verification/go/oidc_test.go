// SPDX-License-Identifier: Apache-2.0
package oidcverify

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

const iss, aud = "https://idp.example.test", "client-123"

type idp struct {
	mu      sync.Mutex
	keys    map[string]*rsa.PrivateKey
	fetches atomic.Int32
}

func (i *idp) add(t *testing.T, kid string) *rsa.PrivateKey {
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	i.mu.Lock()
	i.keys[kid] = k
	i.mu.Unlock()
	return k
}

func (i *idp) ServeHTTP(w http.ResponseWriter, _ *http.Request) {
	i.fetches.Add(1)
	i.mu.Lock()
	defer i.mu.Unlock()
	set := jose.JSONWebKeySet{}
	for kid, k := range i.keys {
		set.Keys = append(set.Keys, jose.JSONWebKey{Key: &k.PublicKey, KeyID: kid, Algorithm: "RS256", Use: "sig"})
	}
	_ = json.NewEncoder(w).Encode(set)
}

type claims struct {
	jwt.Claims
	Nonce string `json:"nonce,omitempty"`
}

func sign(t *testing.T, k *rsa.PrivateKey, kid string, mod func(*claims)) string {
	s, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: k}, (&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", kid))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	c := claims{Claims: jwt.Claims{Issuer: iss, Audience: jwt.Audience{aud}, Subject: "user-1",
		IssuedAt: jwt.NewNumericDate(now), NotBefore: jwt.NewNumericDate(now), Expiry: jwt.NewNumericDate(now.Add(5 * time.Minute))}, Nonce: "n-1"}
	if mod != nil {
		mod(&c)
	}
	raw, err := jwt.Signed(s).Claims(c).Serialize()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestVerify(t *testing.T) {
	p := &idp{keys: map[string]*rsa.PrivateKey{}}
	k1 := p.add(t, "k1")
	srv := httptest.NewServer(p)
	defer srv.Close()
	ctx := context.Background()
	v, err := New(ctx, Config{Issuer: iss, ClientID: aud, JWKSURL: srv.URL, Leeway: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}

	tok, err := v.Verify(ctx, sign(t, k1, "k1", nil), "n-1")
	if err != nil || tok.Subject != "user-1" {
		t.Fatalf("valid token rejected: %v", err)
	}
	now := time.Now()
	bad := map[string]string{
		"aud":     sign(t, k1, "k1", func(c *claims) { c.Audience = jwt.Audience{"other"} }),
		"iss":     sign(t, k1, "k1", func(c *claims) { c.Issuer = "https://evil.test" }),
		"expired": sign(t, k1, "k1", func(c *claims) { c.Expiry = jwt.NewNumericDate(now.Add(-30 * time.Second)) }),
		"nbf":     sign(t, k1, "k1", func(c *claims) { c.NotBefore = jwt.NewNumericDate(now.Add(10 * time.Minute)) }),
	}
	for name, raw := range bad {
		if _, err := v.Verify(ctx, raw, ""); err == nil {
			t.Errorf("%s: expected rejection", name)
		}
	}
	var expErr *oidc.TokenExpiredError
	if _, err := v.Verify(ctx, bad["expired"], ""); !errors.As(err, &expErr) {
		t.Errorf("expected TokenExpiredError, got %v", err)
	}
	if _, err := v.Verify(ctx, sign(t, k1, "k1", func(c *claims) { c.Expiry = jwt.NewNumericDate(now.Add(-2 * time.Second)) }), ""); err != nil {
		t.Errorf("token within leeway rejected: %v", err)
	}
	if _, err := v.Verify(ctx, sign(t, k1, "k1", nil), "other"); !errors.Is(err, ErrNonce) {
		t.Errorf("expected nonce mismatch, got %v", err)
	}
	good := sign(t, k1, "k1", nil)
	if _, err := v.Verify(ctx, good[:len(good)-4]+"AAAA", ""); err == nil {
		t.Error("tampered signature accepted")
	}
	hs, _ := jose.NewSigner(jose.SigningKey{Algorithm: jose.HS256, Key: []byte(strings.Repeat("x", 32))}, (&jose.SignerOptions{}).WithHeader("kid", "k1"))
	hsRaw, _ := jwt.Signed(hs).Claims(jwt.Claims{Issuer: iss, Audience: jwt.Audience{aud}, Expiry: jwt.NewNumericDate(now.Add(time.Minute))}).Serialize()
	if _, err := v.Verify(ctx, hsRaw, ""); err == nil {
		t.Error("HS256 token accepted")
	}

	// rotation
	before := p.fetches.Load()
	k2 := p.add(t, "k2")
	if _, err := v.Verify(ctx, sign(t, k2, "k2", nil), ""); err != nil {
		t.Fatalf("rotated key rejected: %v", err)
	}
	if p.fetches.Load() <= before {
		t.Error("JWKS was not refetched on unknown kid")
	}
	stranger, _ := rsa.GenerateKey(rand.Reader, 2048)
	if _, err := v.Verify(ctx, sign(t, stranger, "nope", nil), ""); err == nil {
		t.Error("unknown key accepted")
	}
	if _, err := New(ctx, Config{Issuer: iss, ClientID: aud, JWKSURL: srv.URL, Algorithms: []string{"HS256"}}); err == nil {
		t.Error("HS256 config accepted")
	}
}
