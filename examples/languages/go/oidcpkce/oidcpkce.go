// SPDX-License-Identifier: Apache-2.0

// Package oidcpkce builds and checks the browser leg of an OAuth 2.0
// authorization code flow with PKCE (RFC 7636) for OpenID Connect sign-in.
//
// Scope: this package only creates the authorization request, parses the
// callback and formats the token request body. ID token and access token
// VERIFICATION must use a vetted OIDC/JOSE library (see the Tier B
// cookbook). Never decode a token to make an authorization decision here.
package oidcpkce

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

const unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

var (
	// ErrStateMismatch is returned when the callback state differs from the expected state.
	ErrStateMismatch = errors.New("state_mismatch")
	// ErrMissingCode is returned when the callback has neither a code nor an error.
	ErrMissingCode = errors.New("missing_code")
)

// AuthorizationError carries an OAuth error returned on the callback.
type AuthorizationError struct {
	Code        string
	Description string
}

func (e *AuthorizationError) Error() string {
	if e.Description == "" {
		return "authorization error: " + e.Code
	}
	return "authorization error: " + e.Code + ": " + e.Description
}

// GenerateCodeVerifier returns a random PKCE verifier of length 43..128
// characters drawn without bias from the RFC 7636 unreserved alphabet.
func GenerateCodeVerifier(length int) (string, error) {
	if length < 43 || length > 128 {
		return "", errors.New("oidcpkce: verifier length must be between 43 and 128")
	}
	const limit = 256 - 256%len(unreserved) // reject bytes that would bias the modulo
	out := make([]byte, 0, length)
	buf := make([]byte, length)
	for len(out) < length {
		if _, err := rand.Read(buf); err != nil {
			return "", fmt.Errorf("oidcpkce: random source failed: %w", err)
		}
		for _, b := range buf {
			if int(b) < limit && len(out) < length {
				out = append(out, unreserved[int(b)%len(unreserved)])
			}
		}
	}
	return string(out), nil
}

// CodeChallengeS256 returns base64url(SHA-256(verifier)) without padding.
func CodeChallengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// RandomToken returns n random bytes (n <= 0 selects 32) as unpadded base64url,
// suitable for state and nonce values.
func RandomToken(n int) (string, error) {
	if n <= 0 {
		n = 32
	}
	if n > 1024 {
		return "", errors.New("oidcpkce: token length too large")
	}
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("oidcpkce: random source failed: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Param is one ordered query parameter.
type Param struct{ Name, Value string }

// AuthRequest describes an authorization request. Scope entries may each
// contain several space-separated scopes; "openid" must be present.
type AuthRequest struct {
	AuthorizationEndpoint string
	ClientID              string
	RedirectURI           string
	Scope                 []string
	State                 string
	Nonce                 string
	CodeChallenge         string
	ExtraParams           []Param
}

var reservedParams = map[string]bool{
	"response_type": true, "client_id": true, "redirect_uri": true, "scope": true, "state": true,
	"nonce": true, "code_challenge": true, "code_challenge_method": true,
}

func validEndpoint(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || strings.ContainsAny(raw, " \r\n#") {
		return nil, errors.New("oidcpkce: invalid authorization endpoint")
	}
	host := u.Hostname()
	if u.Scheme == "https" || (u.Scheme == "http" && (host == "localhost" || host == "127.0.0.1")) {
		return u, nil
	}
	return nil, errors.New("oidcpkce: authorization endpoint must use https (http only for localhost)")
}

// BuildAuthorizationURL returns the authorization URL with parameters in a
// fixed order, preserving any query already present on the endpoint.
func BuildAuthorizationURL(r AuthRequest) (string, error) {
	if _, err := validEndpoint(r.AuthorizationEndpoint); err != nil {
		return "", err
	}
	scopes := strings.Fields(strings.Join(r.Scope, " "))
	hasOpenID := false
	for _, s := range scopes {
		hasOpenID = hasOpenID || s == "openid"
	}
	if !hasOpenID {
		return "", errors.New("oidcpkce: scope must include openid")
	}
	if r.ClientID == "" || r.RedirectURI == "" || r.State == "" || r.Nonce == "" || r.CodeChallenge == "" {
		return "", errors.New("oidcpkce: client_id, redirect_uri, state, nonce and code_challenge are required")
	}
	params := []Param{
		{"response_type", "code"},
		{"client_id", r.ClientID},
		{"redirect_uri", r.RedirectURI},
		{"scope", strings.Join(scopes, " ")},
		{"state", r.State},
		{"nonce", r.Nonce},
		{"code_challenge", r.CodeChallenge},
		{"code_challenge_method", "S256"},
	}
	for _, p := range r.ExtraParams {
		if p.Name == "" || reservedParams[p.Name] {
			return "", fmt.Errorf("oidcpkce: extra parameter %q is empty or reserved", p.Name)
		}
		params = append(params, p)
	}
	var b strings.Builder
	b.WriteString(r.AuthorizationEndpoint)
	switch {
	case !strings.Contains(r.AuthorizationEndpoint, "?"):
		b.WriteByte('?')
	case !strings.HasSuffix(r.AuthorizationEndpoint, "?") && !strings.HasSuffix(r.AuthorizationEndpoint, "&"):
		b.WriteByte('&')
	}
	for i, p := range params {
		if i > 0 {
			b.WriteByte('&')
		}
		b.WriteString(percentEncode(p.Name))
		b.WriteByte('=')
		b.WriteString(percentEncode(p.Value))
	}
	return b.String(), nil
}

// ParseCallback extracts the authorization code from the redirect URL.
// It returns *AuthorizationError when the provider reported an error,
// ErrMissingCode when no code is present and ErrStateMismatch when the
// state differs from expectedState (compared in constant time).
func ParseCallback(callbackURL, expectedState string) (string, error) {
	u, err := url.Parse(callbackURL)
	if err != nil {
		return "", errors.New("oidcpkce: invalid callback URL")
	}
	q, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "", errors.New("oidcpkce: invalid callback query")
	}
	if q.Has("error") {
		return "", &AuthorizationError{Code: q.Get("error"), Description: q.Get("error_description")}
	}
	code := q.Get("code")
	if code == "" {
		return "", ErrMissingCode
	}
	state := q.Get("state")
	if expectedState == "" || subtle.ConstantTimeCompare([]byte(state), []byte(expectedState)) != 1 {
		return "", ErrStateMismatch
	}
	return code, nil
}

// TokenRequest holds the authorization-code exchange inputs.
type TokenRequest struct {
	Code, RedirectURI, ClientID, CodeVerifier string
}

// TokenRequestBody returns the application/x-www-form-urlencoded body for
// the token endpoint, with fields in a fixed order.
func TokenRequestBody(r TokenRequest) (string, error) {
	if r.Code == "" || r.RedirectURI == "" || r.ClientID == "" || r.CodeVerifier == "" {
		return "", errors.New("oidcpkce: code, redirect_uri, client_id and code_verifier are required")
	}
	return "grant_type=authorization_code" +
		"&code=" + url.QueryEscape(r.Code) +
		"&redirect_uri=" + url.QueryEscape(r.RedirectURI) +
		"&client_id=" + url.QueryEscape(r.ClientID) +
		"&code_verifier=" + url.QueryEscape(r.CodeVerifier), nil
}

// percentEncode keeps RFC 3986 unreserved bytes and encodes the rest as %XX.
func percentEncode(s string) string {
	const hexDigits = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if strings.IndexByte(unreserved, c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hexDigits[c>>4])
			b.WriteByte(hexDigits[c&15])
		}
	}
	return b.String()
}
