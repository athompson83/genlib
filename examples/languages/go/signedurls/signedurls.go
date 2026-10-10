// SPDX-License-Identifier: Apache-2.0

// Package signedurls creates and checks expiring HMAC-SHA256 signed URLs of
// the form "<path>?<query>&expires=<unix seconds>&signature=<base64url>".
// The signature covers everything before "&signature=". Verification is
// constant time; keep the secret on the server and rotate it if leaked.
package signedurls

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
)

// Verification failures; returned errors wrap exactly one of these.
var (
	ErrMalformed    = errors.New("malformed")
	ErrBadSignature = errors.New("bad signature")
	ErrExpired      = errors.New("expired")
)

type detailed struct {
	kind   error
	detail string
}

func (e detailed) Error() string { return e.kind.Error() + ": " + e.detail }
func (e detailed) Unwrap() error { return e.kind }

const sigSep = "&signature="

func mac(secret, message string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(message))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

func paramNames(target string) []string {
	_, q, ok := strings.Cut(target, "?")
	if !ok {
		return nil
	}
	var names []string
	for _, p := range strings.Split(q, "&") {
		if p != "" {
			name, _, _ := strings.Cut(p, "=")
			names = append(names, name)
		}
	}
	return names
}

// SignURL appends expires and signature to target, a path starting with "/"
// plus an optional query, with no fragment.
func SignURL(target, secret string, expiresUnixSeconds int64) (string, error) {
	if secret == "" {
		return "", errors.New("signedurls: secret must not be empty")
	}
	if !strings.HasPrefix(target, "/") || strings.Contains(target, "#") {
		return "", errors.New("signedurls: target must start with / and have no fragment")
	}
	if expiresUnixSeconds < 0 {
		return "", errors.New("signedurls: expires must be >= 0")
	}
	for _, n := range paramNames(target) {
		if n == "expires" || n == "signature" {
			return "", errors.New("signedurls: target already has an expires or signature parameter")
		}
	}
	sep := "?"
	if strings.Contains(target, "?") {
		sep = "&"
	}
	message := target + sep + "expires=" + strconv.FormatInt(expiresUnixSeconds, 10)
	return message + sigSep + mac(secret, message), nil
}

func isBase64URL(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

// VerifyURL checks signed at nowUnixSeconds and returns its expiry. A URL is
// still valid when now equals expires. Errors wrap ErrMalformed,
// ErrBadSignature or ErrExpired, except a plain error for an empty secret.
func VerifyURL(signed, secret string, nowUnixSeconds int64) (int64, error) {
	if secret == "" {
		return 0, errors.New("signedurls: secret must not be empty")
	}
	i := strings.LastIndex(signed, sigSep)
	if i < 0 {
		return 0, detailed{ErrMalformed, "missing signature"}
	}
	message, sig := signed[:i], signed[i+len(sigSep):]
	if len(sig) != 43 || !isBase64URL(sig) {
		return 0, detailed{ErrMalformed, "signature must be 43 base64url characters at the end"}
	}
	_, query, ok := strings.Cut(message, "?")
	if !ok {
		return 0, detailed{ErrMalformed, "missing query"}
	}
	var expires []string
	for _, p := range strings.Split(query, "&") {
		if name, value, _ := strings.Cut(p, "="); name == "expires" {
			expires = append(expires, value)
		}
	}
	if len(expires) != 1 {
		return 0, detailed{ErrMalformed, "need exactly one expires parameter"}
	}
	e := expires[0]
	if e == "" || len(e) > 18 || strings.Trim(e, "0123456789") != "" {
		return 0, detailed{ErrMalformed, "expires must be decimal seconds"}
	}
	exp, _ := strconv.ParseInt(e, 10, 64)
	if subtle.ConstantTimeCompare([]byte(mac(secret, message)), []byte(sig)) != 1 {
		return 0, ErrBadSignature
	}
	if nowUnixSeconds > exp {
		return 0, ErrExpired
	}
	return exp, nil
}
