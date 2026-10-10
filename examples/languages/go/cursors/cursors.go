// SPDX-License-Identifier: Apache-2.0

// Package cursors encodes HMAC-SHA256 signed, expiring pagination cursors.
// A token is base64url(body) "." base64url(mac), both unpadded, where body is
// "v1\n" + expiresAt + "\n" + values joined by "\n". Values are visible to
// clients (signed, not encrypted); keep the secret on the server.
package cursors

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

const (
	MaxValues      = 16
	MinSecretBytes = 32
)

// Sentinel errors for the three decode failure kinds; test with errors.Is.
var (
	ErrMalformed    = errors.New("malformed")
	ErrBadSignature = errors.New("bad signature")
	ErrExpired      = errors.New("expired")
)

var (
	b64RE    = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)
	digitsRE = regexp.MustCompile(`^[0-9]+$`)
)

func checkSecret(secret []byte) error {
	if len(secret) < MinSecretBytes {
		return errors.New("cursors: secret must be at least 32 bytes")
	}
	return nil
}

func sign(secret, body []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return mac.Sum(nil)
}

// Encode signs 1 to 16 values (none containing "\n") with an expiry in unix seconds.
func Encode(values []string, secret []byte, expiresAt int64) (string, error) {
	if err := checkSecret(secret); err != nil {
		return "", err
	}
	if len(values) == 0 || len(values) > MaxValues {
		return "", errors.New("cursors: values must hold 1 to 16 strings")
	}
	for _, v := range values {
		if strings.Contains(v, "\n") {
			return "", errors.New("cursors: values must not contain newlines")
		}
	}
	if expiresAt <= 0 {
		return "", errors.New("cursors: expiresAt must be positive")
	}
	body := []byte("v1\n" + strconv.FormatInt(expiresAt, 10) + "\n" + strings.Join(values, "\n"))
	enc := base64.RawURLEncoding
	return enc.EncodeToString(body) + "." + enc.EncodeToString(sign(secret, body)), nil
}

func decodePart(part string) ([]byte, error) {
	if !b64RE.MatchString(part) {
		return nil, errors.New("invalid base64url")
	}
	return base64.RawURLEncoding.DecodeString(part)
}

func malformed(detail string) error {
	return errorWrap{ErrMalformed, detail}
}

type errorWrap struct {
	kind   error
	detail string
}

func (e errorWrap) Error() string { return e.kind.Error() + ": " + e.detail }
func (e errorWrap) Unwrap() error { return e.kind }

// Decode verifies the signature and expiry and returns the values. Failures
// wrap ErrMalformed, ErrBadSignature or ErrExpired; messages start with the kind.
func Decode(token string, secret []byte, now int64) ([]string, error) {
	if err := checkSecret(secret); err != nil {
		return nil, err
	}
	dot := strings.LastIndexByte(token, '.')
	if dot < 0 {
		return nil, malformed("missing signature")
	}
	body, err := decodePart(token[:dot])
	if err != nil {
		return nil, malformed("body: " + err.Error())
	}
	if _, err := decodePart(token[dot+1:]); err != nil {
		return nil, malformed("signature: " + err.Error())
	}
	// Compare the canonical encoding so a changed unused trailing bit also fails.
	want := base64.RawURLEncoding.EncodeToString(sign(secret, body))
	if subtle.ConstantTimeCompare([]byte(token[dot+1:]), []byte(want)) != 1 {
		return nil, ErrBadSignature
	}
	lines := strings.Split(string(body), "\n")
	if len(lines) < 3 || lines[0] != "v1" || !digitsRE.MatchString(lines[1]) {
		return nil, malformed("bad header")
	}
	expiresAt, err := strconv.ParseInt(lines[1], 10, 64)
	if err != nil {
		return nil, malformed("bad expiry")
	}
	if now >= expiresAt {
		return nil, ErrExpired
	}
	return lines[2:], nil
}
