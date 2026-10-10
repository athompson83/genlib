// SPDX-License-Identifier: Apache-2.0

// Package emailaddress checks the WHATWG HTML "valid e-mail address" syntax
// (the rule browsers use for <input type=email>), ASCII only, with a 254
// character total and 64 character local-part limit. This is syntax only:
// "a@b" and "user.@example.com" are valid by WHATWG, and only a confirmation
// email proves that an address exists and belongs to the user.
package emailaddress

import (
	"errors"
	"regexp"
	"strings"
)

var pattern = regexp.MustCompile("^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$")

// Valid reports whether s is a syntactically valid email address.
func Valid(s string) bool {
	if len(s) > 254 || !pattern.MatchString(s) {
		return false
	}
	return strings.IndexByte(s, '@') <= 64
}

// Normalize trims ASCII whitespace, validates, and lowercases the domain while
// keeping the local part's case.
func Normalize(s string) (string, error) {
	t := strings.Trim(s, " \t\n\f\r")
	if !Valid(t) {
		return "", errors.New("emailaddress: invalid email address")
	}
	at := strings.IndexByte(t, '@')
	return t[:at] + "@" + strings.ToLower(t[at+1:]), nil
}
