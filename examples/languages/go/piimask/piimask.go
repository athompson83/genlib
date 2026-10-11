// SPDX-License-Identifier: Apache-2.0

// Package piimask masks personal data for logs and user interfaces. It is
// display masking, not anonymization: the kept characters can still identify
// a person when combined with other data.
package piimask

import (
	"errors"
	"strings"
	"unicode"
)

// ErrPII is returned when an input is not the expected kind of value.
var ErrPII = errors.New("piimask: invalid input")

func isASCIIDigit(c rune) bool { return c >= '0' && c <= '9' }

// MaskEmail keeps the first code point of the local part, masks the rest (at least 3 '*') and keeps the domain.
func MaskEmail(e string) (string, error) {
	if strings.Count(e, "@") != 1 {
		return "", ErrPII
	}
	at := strings.IndexByte(e, '@')
	local, domain := []rune(e[:at]), e[at+1:]
	if len(local) == 0 || domain == "" {
		return "", ErrPII
	}
	n := len(local) - 1
	if n < 3 {
		n = 3
	}
	return string(local[0]) + strings.Repeat("*", n) + "@" + domain, nil
}

// MaskPhone keeps the last 4 ASCII digits and a leading "+CC " country code, masking every other ASCII digit.
func MaskPhone(p string) (string, error) {
	total := 0
	for _, c := range p {
		if isASCIIDigit(c) {
			total++
		}
	}
	if total < 7 {
		return "", ErrPII
	}
	keepFront := 0
	r := []rune(p)
	if len(r) > 0 && r[0] == '+' {
		j := 1
		for j < len(r) && j <= 3 && unicode.IsDigit(r[j]) {
			j++
		}
		if j > 1 && j < len(r) && r[j] == ' ' {
			keepFront = j - 1
		}
	}
	var b strings.Builder
	seen := 0
	for _, c := range r {
		if isASCIIDigit(c) {
			if seen < keepFront || seen >= total-4 {
				b.WriteRune(c)
			} else {
				b.WriteByte('*')
			}
			seen++
		} else {
			b.WriteRune(c)
		}
	}
	return b.String(), nil
}

// MaskCard keeps the last 4 of 12-19 digits and the space or hyphen separators; other characters are an error.
func MaskCard(c string) (string, error) {
	if c == "" {
		return "", ErrPII
	}
	total := 0
	for _, ch := range c {
		switch {
		case isASCIIDigit(ch):
			total++
		case ch == ' ' || ch == '-':
		default:
			return "", ErrPII
		}
	}
	if total < 12 || total > 19 {
		return "", ErrPII
	}
	var b strings.Builder
	seen := 0
	for _, ch := range c {
		if isASCIIDigit(ch) {
			if seen >= total-4 {
				b.WriteRune(ch)
			} else {
				b.WriteByte('*')
			}
			seen++
		} else {
			b.WriteRune(ch)
		}
	}
	return b.String(), nil
}

// MaskMiddle keeps keepStart and keepEnd code points (callers usually pass 1, 1, "*") and masks the rest, or everything when too short.
func MaskMiddle(s string, keepStart, keepEnd int, mask string) (string, error) {
	if keepStart < 0 || keepEnd < 0 || len([]rune(mask)) != 1 {
		return "", ErrPII
	}
	r := []rune(s)
	if len(r) <= keepStart+keepEnd {
		return strings.Repeat(mask, len(r)), nil
	}
	return string(r[:keepStart]) + strings.Repeat(mask, len(r)-keepStart-keepEnd) + string(r[len(r)-keepEnd:]), nil
}

func luhn(d []byte) bool {
	s := 0
	for i := 0; i < len(d); i++ {
		n := int(d[len(d)-1-i] - '0')
		if i%2 == 1 {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		s += n
	}
	return s%10 == 0
}

func isDigit(c byte) bool { return c >= '0' && c <= '9' }

// redactCards masks runs of 13-19 digits (single space or hyphen separators allowed,
// not touching other digits) that pass the Luhn check.
func redactCards(t string) string {
	var out strings.Builder
	n := len(t)
	for i := 0; i < n; {
		if isDigit(t[i]) && (i == 0 || !isDigit(t[i-1])) {
			ends := []int{i + 1}
			j := i + 1
			for len(ends) < 19 {
				k := j
				if k < n && (t[k] == ' ' || t[k] == '-') {
					k++
				}
				if k < n && isDigit(t[k]) {
					j = k + 1
					ends = append(ends, j)
				} else {
					break
				}
			}
			end := -1
			for c := len(ends); c >= 13; c-- {
				if e := ends[c-1]; e >= n || !isDigit(t[e]) {
					end = e
					break
				}
			}
			if end > 0 {
				run := t[i:end]
				var digits []byte
				for k := 0; k < len(run); k++ {
					if isDigit(run[k]) {
						digits = append(digits, run[k])
					}
				}
				if luhn(digits) {
					masked, _ := MaskCard(run)
					run = masked
				}
				out.WriteString(run)
				i = end
				continue
			}
		}
		out.WriteByte(t[i])
		i++
	}
	return out.String()
}

func isLocal(c byte) bool {
	return isDigit(c) || (c|32 >= 'a' && c|32 <= 'z') || strings.IndexByte("._%+-", c) >= 0
}

func isDomain(c byte) bool { return isDigit(c) || (c|32 >= 'a' && c|32 <= 'z') || c == '.' || c == '-' }

func isLetter(c byte) bool { return c|32 >= 'a' && c|32 <= 'z' }

// emailEnd returns the end of [A-Za-z0-9.-]+\.[A-Za-z]{2,} starting at i, or -1.
func emailEnd(t string, i int) int {
	d := i
	for d < len(t) && isDomain(t[d]) {
		d++
	}
	for p := d - 1; p >= i+1; p-- {
		if t[p] == '.' && p+2 < len(t) && isLetter(t[p+1]) && isLetter(t[p+2]) {
			e := p + 1
			for e < len(t) && isLetter(t[e]) {
				e++
			}
			return e
		}
	}
	return -1
}

func redactEmails(t string) string {
	var out strings.Builder
	n := len(t)
	for i := 0; i < n; {
		if !isLocal(t[i]) {
			out.WriteByte(t[i])
			i++
			continue
		}
		r := i
		for r < n && isLocal(t[r]) {
			r++
		}
		if r < n && t[r] == '@' {
			if e := emailEnd(t, r+1); e > 0 {
				masked, _ := MaskEmail(t[i:e])
				out.WriteString(masked)
				i = e
				continue
			}
		}
		out.WriteString(t[i:r])
		i = r
	}
	return out.String()
}

// Redact masks Luhn-valid card numbers and then email addresses in free text; phone numbers are not detected.
func Redact(text string) string { return redactEmails(redactCards(text)) }
