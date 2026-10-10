// SPDX-License-Identifier: Apache-2.0

// Package oidcverify is a thin wrapper around github.com/coreos/go-oidc/v3.
// go-oidc verifies the JWS signature against a cached remote JWKS (refetching on an
// unknown kid), the alg allow-list, iss, aud, exp and nbf (nbf with a fixed 5 minute
// skew, exp with none). This package adds a small exp leeway by shifting the verifier's
// clock back (Config.Now) and the nonce comparison, which go-oidc leaves to callers.
package oidcverify

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

type Config struct {
	Issuer     string        // exact iss
	ClientID   string        // expected aud
	JWKSURL    string        // jwks_uri from discovery (https in production)
	Algorithms []string      // e.g. []string{oidc.RS256, oidc.ES256}
	Leeway     time.Duration // small exp tolerance, e.g. 60s; must be < 5m (nbf skew becomes 5m-Leeway)
}

type Verifier struct {
	v *oidc.IDTokenVerifier
}

// New builds a verifier without network discovery. Use oidc.NewProvider(ctx, issuer)
// instead if you want discovery to supply the JWKS URL.
func New(ctx context.Context, c Config) (*Verifier, error) {
	if len(c.Algorithms) == 0 {
		c.Algorithms = []string{oidc.RS256, oidc.ES256}
	}
	for _, a := range c.Algorithms {
		if a == "none" || a == "HS256" || a == "HS384" || a == "HS512" {
			return nil, fmt.Errorf("algorithm %q not allowed with a public JWKS", a)
		}
	}
	if c.Leeway < 0 || c.Leeway >= 5*time.Minute {
		return nil, fmt.Errorf("leeway must be in [0, 5m)")
	}
	keys := oidc.NewRemoteKeySet(ctx, c.JWKSURL) // caches keys; refetches on kid miss
	v := oidc.NewVerifier(c.Issuer, keys, &oidc.Config{
		ClientID:             c.ClientID,
		SupportedSigningAlgs: c.Algorithms,
		Now:                  func() time.Time { return time.Now().Add(-c.Leeway) },
	})
	return &Verifier{v: v}, nil
}

var ErrNonce = errors.New("oidc: nonce mismatch")

// Verify checks the raw token. Pass the nonce stored with the auth request, or "" to skip.
func (v *Verifier) Verify(ctx context.Context, raw, nonce string) (*oidc.IDToken, error) {
	tok, err := v.v.Verify(ctx, raw)
	if err != nil {
		return nil, err
	}
	if nonce != "" && tok.Nonce != nonce {
		return nil, ErrNonce
	}
	return tok, nil
}
