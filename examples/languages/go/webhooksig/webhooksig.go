// SPDX-License-Identifier: Apache-2.0

// Package webhooksig signs and verifies Stripe-style webhook headers of the
// form "t=<seconds>,v1=<hex HMAC-SHA256>" over "<t>.<body>". Verification
// accepts any matching v1 (secret rotation), ignores other schemes such as v0,
// compares in constant time and enforces a timestamp tolerance.
package webhooksig

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"regexp"
	"strconv"
	"strings"
)

// DefaultTolerance is the accepted clock difference in seconds.
const DefaultTolerance = 300

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

var (
	decimal = regexp.MustCompile(`^[0-9]{1,18}$`)
	v1Hex   = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

func mac(secret []byte, ts int64, body []byte) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(strconv.FormatInt(ts, 10) + "."))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}

// Sign returns the header for secret, timestamp (seconds) and body.
func Sign(secret []byte, timestamp int64, body []byte) (string, error) {
	if len(secret) == 0 {
		return "", errors.New("webhooksig: secret must not be empty")
	}
	if timestamp < 0 {
		return "", errors.New("webhooksig: timestamp must be >= 0")
	}
	return "t=" + strconv.FormatInt(timestamp, 10) + ",v1=" + mac(secret, timestamp, body), nil
}

// Verify checks header against body and secret at now (seconds) and returns
// the signed timestamp. Errors wrap ErrMalformed, ErrBadSignature or ErrExpired,
// except a plain error for an empty secret or negative tolerance.
func Verify(header string, body, secret []byte, now, tolerance int64) (int64, error) {
	if len(secret) == 0 {
		return 0, errors.New("webhooksig: secret must not be empty")
	}
	if tolerance < 0 {
		return 0, errors.New("webhooksig: tolerance must be >= 0")
	}
	var stamps, sigs []string
	for _, part := range strings.Split(header, ",") {
		name, value, ok := strings.Cut(part, "=")
		name, value = strings.TrimSpace(name), strings.TrimSpace(value)
		if !ok || name == "" {
			return 0, detailed{ErrMalformed, "expected comma-separated key=value pairs"}
		}
		switch name {
		case "t":
			stamps = append(stamps, value)
		case "v1":
			sigs = append(sigs, value)
		}
	}
	if len(stamps) != 1 || !decimal.MatchString(stamps[0]) {
		return 0, detailed{ErrMalformed, "need exactly one decimal t"}
	}
	if len(sigs) == 0 {
		return 0, detailed{ErrMalformed, "need at least one v1 signature"}
	}
	for _, s := range sigs {
		if !v1Hex.MatchString(s) {
			return 0, detailed{ErrMalformed, "v1 must be 64 lowercase hex characters"}
		}
	}
	ts, _ := strconv.ParseInt(stamps[0], 10, 64)
	expected := []byte(mac(secret, ts, body))
	matched := 0
	for _, s := range sigs {
		matched |= subtle.ConstantTimeCompare(expected, []byte(s))
	}
	if matched != 1 {
		return 0, ErrBadSignature
	}
	if diff := now - ts; diff > tolerance || -diff > tolerance {
		return 0, ErrExpired
	}
	return ts, nil
}
