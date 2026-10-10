// SPDX-License-Identifier: Apache-2.0

// Package vcard builds RFC 6350 vCard 4.0 contact cards with escaped text
// values, validated email, telephone, URL and TYPE values, and UTF-8-safe
// 75-octet line folding. Output lines end with CRLF.
package vcard

import (
	"errors"
	"strings"
	"unicode"
)

// Name is the structured N property; empty components are written empty.
type Name struct {
	Family, Given, Additional, Prefix, Suffix string
}

// Typed is an email or telephone value with an optional TYPE parameter
// (empty means none) matching [a-z][a-z0-9-]*.
type Typed struct {
	Value, Type string
}

// Address is the structured ADR property with an optional TYPE parameter.
type Address struct {
	Type, POBox, Extended, Street, Locality, Region, PostalCode, Country string
}

// Contact is the exported card. FN is required; nil or empty optional fields
// are omitted.
type Contact struct {
	FN      string
	N       *Name
	Org     string
	Title   string
	Emails  []Typed
	Phones  []Typed
	Address *Address
	URLs    []string
	Note    string
	UID     string
}

func escape(s string) (string, error) {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r == '\\':
			b.WriteString(`\\`)
		case r == ',':
			b.WriteString(`\,`)
		case r == ';':
			b.WriteString(`\;`)
		case r == '\n':
			b.WriteString(`\n`)
		case r < 0x20 || r == 0x7f:
			return "", errors.New("vcard: control character in text value")
		default:
			b.WriteRune(r)
		}
	}
	return b.String(), nil
}

func joinEscaped(parts ...string) (string, error) {
	out := make([]string, len(parts))
	for i, p := range parts {
		e, err := escape(p)
		if err != nil {
			return "", err
		}
		out[i] = e
	}
	return strings.Join(out, ";"), nil
}

func typeParam(t string) (string, error) {
	if t == "" {
		return "", nil
	}
	for i := 0; i < len(t); i++ {
		c := t[i]
		if !(c >= 'a' && c <= 'z' || i > 0 && (c >= '0' && c <= '9' || c == '-')) {
			return "", errors.New("vcard: TYPE must match [a-z][a-z0-9-]*")
		}
	}
	return ";TYPE=" + t, nil
}

func validEmail(s string) bool {
	at := strings.IndexByte(s, '@')
	if at <= 0 || at == len(s)-1 || strings.IndexByte(s[at+1:], '@') >= 0 {
		return false
	}
	return strings.IndexFunc(s, unicode.IsSpace) < 0
}

func validPhone(s string) bool {
	s = strings.TrimPrefix(s, "+")
	if len(s) < 2 || len(s) > 31 || s[0] < '0' || s[0] > '9' {
		return false
	}
	for i := 1; i < len(s); i++ {
		if !strings.ContainsRune("0123456789 ().-", rune(s[i])) {
			return false
		}
	}
	return true
}

func validURL(s string) bool {
	rest := ""
	if strings.HasPrefix(s, "https://") {
		rest = s[8:]
	} else if strings.HasPrefix(s, "http://") {
		rest = s[7:]
	}
	return rest != "" && strings.IndexFunc(rest, unicode.IsSpace) < 0
}

// fold writes line folded at 75 octets (74 after the leading space), never
// splitting a UTF-8 sequence, terminated by CRLF.
func fold(line string, b *strings.Builder) {
	limit := 75
	for len(line) > limit {
		end := limit
		for line[end]&0xC0 == 0x80 {
			end--
		}
		b.WriteString(line[:end])
		b.WriteString("\r\n ")
		line, limit = line[end:], 74
	}
	b.WriteString(line)
	b.WriteString("\r\n")
}

// Build returns the vCard text or an error for a blank FN, an invalid email,
// telephone, URL or TYPE value, or a control character other than newline in
// a text value.
func Build(c Contact) (string, error) {
	if strings.TrimSpace(c.FN) == "" {
		return "", errors.New("vcard: FN is required")
	}
	lines := []string{"BEGIN:VCARD", "VERSION:4.0"}
	add := func(prefix, value string) error {
		e, err := escape(value)
		if err == nil {
			lines = append(lines, prefix+e)
		}
		return err
	}
	if err := add("FN:", c.FN); err != nil {
		return "", err
	}
	if c.N != nil {
		v, err := joinEscaped(c.N.Family, c.N.Given, c.N.Additional, c.N.Prefix, c.N.Suffix)
		if err != nil {
			return "", err
		}
		lines = append(lines, "N:"+v)
	}
	if c.Org != "" {
		if err := add("ORG:", c.Org); err != nil {
			return "", err
		}
	}
	if c.Title != "" {
		if err := add("TITLE:", c.Title); err != nil {
			return "", err
		}
	}
	for _, e := range c.Emails {
		if !validEmail(e.Value) {
			return "", errors.New("vcard: invalid email address")
		}
		p, err := typeParam(e.Type)
		if err != nil {
			return "", err
		}
		if err := add("EMAIL"+p+":", e.Value); err != nil {
			return "", err
		}
	}
	for _, t := range c.Phones {
		if !validPhone(t.Value) {
			return "", errors.New("vcard: invalid telephone number")
		}
		p, err := typeParam(t.Type)
		if err != nil {
			return "", err
		}
		lines = append(lines, "TEL"+p+":"+t.Value)
	}
	if a := c.Address; a != nil {
		p, err := typeParam(a.Type)
		if err != nil {
			return "", err
		}
		v, err := joinEscaped(a.POBox, a.Extended, a.Street, a.Locality, a.Region, a.PostalCode, a.Country)
		if err != nil {
			return "", err
		}
		lines = append(lines, "ADR"+p+":"+v)
	}
	for _, u := range c.URLs {
		if !validURL(u) {
			return "", errors.New("vcard: URL must be http(s) without whitespace")
		}
		lines = append(lines, "URL:"+u)
	}
	if c.Note != "" {
		if err := add("NOTE:", c.Note); err != nil {
			return "", err
		}
	}
	if c.UID != "" {
		if err := add("UID:", c.UID); err != nil {
			return "", err
		}
	}
	lines = append(lines, "END:VCARD")
	var b strings.Builder
	for _, l := range lines {
		fold(l, &b)
	}
	return b.String(), nil
}
