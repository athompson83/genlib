// SPDX-License-Identifier: Apache-2.0

// Package punycode implements RFC 3492 Punycode (Bootstring with base 36,
// tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128 and '-'
// as the delimiter) with 31-bit overflow checks, plus a simplified IDNA-style
// domain conversion. The domain functions only lowercase ASCII letters: they
// apply no Unicode normalization and no IDNA (UTS #46) mapping, so normalize
// (NFC, case-fold) first when that matters.
package punycode

import (
	"errors"
	"strings"
)

const (
	base        = 36
	tmin        = 1
	tmax        = 26
	skew        = 38
	damp        = 700
	initialBias = 72
	initialN    = 128
	maxInt      = 1<<31 - 1
)

// ErrPunycode is wrapped by every error from this package.
var ErrPunycode = errors.New("punycode: invalid input")

type punyError struct{ msg string }

func (e *punyError) Error() string { return "punycode: " + e.msg }
func (e *punyError) Unwrap() error { return ErrPunycode }

func fail(msg string) error { return &punyError{msg} }

func adapt(delta, num int64, first bool) int64 {
	if first {
		delta /= damp
	} else {
		delta /= 2
	}
	delta += delta / num
	k := int64(0)
	for delta > ((base-tmin)*tmax)/2 {
		delta /= base - tmin
		k += base
	}
	return k + (base-tmin+1)*delta/(delta+skew)
}

func digit(d int64) byte {
	if d < 26 {
		return byte('a' + d)
	}
	return byte('0' + d - 26)
}

func threshold(k, bias int64) int64 {
	if k <= bias {
		return tmin
	}
	if k >= bias+tmax {
		return tmax
	}
	return k - bias
}

// Encode converts a Unicode string to its Punycode form (no "xn--" prefix).
func Encode(s string) (string, error) {
	cps := []rune(s)
	var out []byte
	for _, c := range cps {
		if c < 0x80 {
			out = append(out, byte(c))
		}
	}
	b := int64(len(out))
	h := b
	if b > 0 {
		out = append(out, '-')
	}
	n, delta, bias := int64(initialN), int64(0), int64(initialBias)
	for h < int64(len(cps)) {
		m := int64(-1)
		for _, c := range cps {
			if int64(c) >= n && (m < 0 || int64(c) < m) {
				m = int64(c)
			}
		}
		if (m-n)*(h+1) > maxInt-delta {
			return "", fail("overflow")
		}
		delta += (m - n) * (h + 1)
		n = m
		for _, c := range cps {
			cv := int64(c)
			if cv < n {
				delta++
				if delta > maxInt {
					return "", fail("overflow")
				}
			}
			if cv == n {
				q := delta
				for k := int64(base); ; k += base {
					t := threshold(k, bias)
					if q < t {
						break
					}
					out = append(out, digit(t+(q-t)%(base-t)))
					q = (q - t) / (base - t)
				}
				out = append(out, digit(q))
				bias = adapt(delta, h+1, h == b)
				delta = 0
				h++
			}
		}
		delta++
		n++
	}
	return string(out), nil
}

func value(c rune) (int64, error) {
	switch {
	case c >= '0' && c <= '9':
		return int64(c) - 22, nil
	case c >= 'A' && c <= 'Z':
		return int64(c) - 'A', nil
	case c >= 'a' && c <= 'z':
		return int64(c) - 'a', nil
	}
	return 0, fail("invalid digit")
}

// Decode converts a Punycode string (either case, no "xn--" prefix) to Unicode.
func Decode(s string) (string, error) {
	in := []rune(s)
	i := -1
	for k := len(in) - 1; k >= 0; k-- {
		if in[k] == '-' {
			i = k
			break
		}
	}
	var out []rune
	if i > 0 {
		for _, c := range in[:i] {
			if c >= 0x80 {
				return "", fail("non-basic code point")
			}
			out = append(out, c)
		}
	}
	pos := 0
	if i >= 0 {
		pos = i + 1
	}
	n, idx, bias := int64(initialN), int64(0), int64(initialBias)
	for pos < len(in) {
		old, w := idx, int64(1)
		for k := int64(base); ; k += base {
			if pos >= len(in) {
				return "", fail("truncated input")
			}
			d, err := value(in[pos])
			if err != nil {
				return "", err
			}
			pos++
			if d > (maxInt-idx)/w {
				return "", fail("overflow")
			}
			idx += d * w
			t := threshold(k, bias)
			if d < t {
				break
			}
			if w > maxInt/(base-t) {
				return "", fail("overflow")
			}
			w *= base - t
		}
		size := int64(len(out) + 1)
		bias = adapt(idx-old, size, old == 0)
		if idx/size > maxInt-n {
			return "", fail("overflow")
		}
		n += idx / size
		idx %= size
		if n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF) {
			return "", fail("invalid code point")
		}
		out = append(out, 0)
		copy(out[idx+1:], out[idx:])
		out[idx] = rune(n)
		idx++
	}
	return string(out), nil
}

func asciiLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}

// DomainToASCII lowercases ASCII letters and encodes each non-ASCII label as "xn--" + Punycode (no normalization or IDNA mapping).
func DomainToASCII(domain string) (string, error) {
	trailing := strings.HasSuffix(domain, ".") && len([]rune(domain)) > 1
	body := domain
	if trailing {
		body = domain[:len(domain)-1]
	}
	var res []string
	for _, l := range strings.Split(body, ".") {
		if l == "" {
			return "", fail("empty label")
		}
		a := asciiLower(l)
		for _, c := range a {
			if c >= 0x80 {
				enc, err := Encode(a)
				if err != nil {
					return "", err
				}
				a = "xn--" + enc
				break
			}
		}
		if len(a) > 63 {
			return "", fail("label too long")
		}
		res = append(res, a)
	}
	out := strings.Join(res, ".")
	if len(out) > 253 {
		return "", fail("name too long")
	}
	if trailing {
		out += "."
	}
	return out, nil
}

// DomainToUnicode decodes each label that starts with "xn--" (any case); other labels are kept as is.
func DomainToUnicode(domain string) (string, error) {
	labels := strings.Split(domain, ".")
	for i, l := range labels {
		r := []rune(l)
		if len(r) >= 4 && asciiLower(string(r[:4])) == "xn--" {
			dec, err := Decode(string(r[4:]))
			if err != nil {
				return "", err
			}
			labels[i] = dec
		}
	}
	return strings.Join(labels, "."), nil
}
