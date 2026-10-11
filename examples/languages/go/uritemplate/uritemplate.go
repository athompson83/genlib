// SPDX-License-Identifier: Apache-2.0

// Package uritemplate expands RFC 6570 URI Templates (levels 1 to 4).
//
// Variables map a name to a string, a []string or an ordered Map of string
// pairs; a missing or nil variable, an empty list and an empty Map are
// undefined and skipped. Unreserved characters are kept; the + and #
// operators also keep reserved characters and existing %XX triplets, and
// everything else is percent-encoded as UTF-8 with uppercase hex. A :n prefix
// counts code points and is an error on lists and maps. Literal text keeps
// unreserved and reserved characters and %XX triplets (RFC 6570 section 3.1)
// and encodes the rest, including a bare '%'.
package uritemplate

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// ErrTemplate is wrapped by every expansion error.
var ErrTemplate = errors.New("uritemplate: invalid template")

// Pair is one key/value member of an ordered Map.
type Pair struct{ Key, Value string }

// Map is an ordered associative value; member order is preserved.
type Map []Pair

func fail(format string, a ...any) error {
	return fmt.Errorf("%w: "+format, append([]any{ErrTemplate}, a...)...)
}

type opSpec struct {
	first, sep string
	named      bool
	ifemp      string
	allow      bool
}

var ops = map[rune]opSpec{
	0:   {"", ",", false, "", false},
	'+': {"", ",", false, "", true},
	'#': {"#", ",", false, "", true},
	'.': {".", ".", false, "", false},
	'/': {"/", "/", false, "", false},
	';': {";", ";", true, "", false},
	'?': {"?", "&", true, "=", false},
	'&': {"&", "&", true, "=", false},
}

func isUnreserved(c rune) bool {
	return c < 0x80 && (c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || strings.ContainsRune("-._~", c))
}

func isReserved(c rune) bool { return strings.ContainsRune(":/?#[]@!$&'()*+,;=", c) }

func isHex(c rune) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}

func enc(s string, allow bool) string {
	r := []rune(s)
	var b strings.Builder
	for i := 0; i < len(r); i++ {
		c := r[i]
		if allow && c == '%' && i+2 < len(r) && isHex(r[i+1]) && isHex(r[i+2]) {
			b.WriteString(string(r[i : i+3]))
			i += 2
			continue
		}
		if isUnreserved(c) || (allow && isReserved(c)) {
			b.WriteRune(c)
			continue
		}
		for _, by := range []byte(string(c)) {
			fmt.Fprintf(&b, "%%%02X", by)
		}
	}
	return b.String()
}

func varUnit(r []rune, i int) int {
	if i < len(r) {
		c := r[i]
		if c < 0x80 && (c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_') {
			return 1
		}
		if c == '%' && i+2 < len(r) && isHex(r[i+1]) && isHex(r[i+2]) {
			return 3
		}
	}
	return 0
}

func validName(name string) bool {
	r := []rune(name)
	n := varUnit(r, 0)
	if n == 0 {
		return false
	}
	i := n
	for i < len(r) {
		if r[i] == '.' {
			i++
		}
		n = varUnit(r, i)
		if n == 0 {
			return false
		}
		i += n
	}
	return true
}

func parseVarspec(spec string) (name string, prefix int, explode bool, err error) {
	cut := strings.IndexAny(spec, ":*")
	name, rest := spec, ""
	if cut >= 0 {
		name, rest = spec[:cut], spec[cut:]
	}
	if name == "" || !validName(name) {
		return "", 0, false, fail("bad varspec: %s", spec)
	}
	switch {
	case rest == "":
	case rest == "*":
		explode = true
	case rest[0] == ':' && len(rest) > 1 && strings.Trim(rest[1:], "0123456789") == "":
		digits := rest[1:]
		if digits[0] == '0' || len(digits) > 4 {
			return "", 0, false, fail("bad prefix: %s", spec)
		}
		prefix, _ = strconv.Atoi(digits)
	default:
		return "", 0, false, fail("bad varspec: %s", spec)
	}
	return name, prefix, explode, nil
}

func expandExpr(expr string, vars map[string]any) (string, error) {
	if expr == "" {
		return "", fail("empty expression")
	}
	c := []rune(expr)[0]
	var op rune
	if strings.ContainsRune("+#./;?&", c) {
		op = c
	} else if strings.ContainsRune("=,!@|", c) {
		return "", fail("reserved operator: %c", c)
	}
	body := expr
	if op != 0 {
		body = expr[1:]
	}
	o := ops[op]
	named := func(name, v string) string {
		if v == "" {
			return enc(name, o.allow) + o.ifemp
		}
		return enc(name, o.allow) + "=" + enc(v, o.allow)
	}
	var parts []string
	for _, spec := range strings.Split(body, ",") {
		name, prefix, explode, err := parseVarspec(spec)
		if err != nil {
			return "", err
		}
		switch v := vars[name].(type) {
		case nil:
		case string:
			if prefix > 0 {
				if r := []rune(v); len(r) > prefix {
					v = string(r[:prefix])
				}
			}
			if o.named {
				parts = append(parts, named(name, v))
			} else {
				parts = append(parts, enc(v, o.allow))
			}
		case []string:
			if len(v) == 0 {
				continue
			}
			if prefix > 0 {
				return "", fail("prefix on composite value: %s", name)
			}
			items := make([]string, len(v))
			for i, x := range v {
				switch {
				case !explode:
					items[i] = enc(x, o.allow)
				case o.named:
					items[i] = named(name, x)
				default:
					items[i] = enc(x, o.allow)
				}
			}
			if !explode {
				joined := strings.Join(items, ",")
				if o.named {
					joined = enc(name, o.allow) + "=" + joined
				}
				parts = append(parts, joined)
			} else {
				parts = append(parts, strings.Join(items, o.sep))
			}
		case Map:
			if len(v) == 0 {
				continue
			}
			if prefix > 0 {
				return "", fail("prefix on composite value: %s", name)
			}
			items := make([]string, len(v))
			for i, p := range v {
				switch {
				case !explode:
					items[i] = enc(p.Key, o.allow) + "," + enc(p.Value, o.allow)
				case o.named:
					items[i] = named(p.Key, p.Value)
				default:
					items[i] = enc(p.Key, o.allow) + "=" + enc(p.Value, o.allow)
				}
			}
			if !explode {
				joined := strings.Join(items, ",")
				if o.named {
					joined = enc(name, o.allow) + "=" + joined
				}
				parts = append(parts, joined)
			} else {
				parts = append(parts, strings.Join(items, o.sep))
			}
		default:
			return "", fail("unsupported value type for %s", name)
		}
	}
	if len(parts) == 0 {
		return "", nil
	}
	return o.first + strings.Join(parts, o.sep), nil
}

// ExpandTemplate expands an RFC 6570 template with the given variables.
func ExpandTemplate(template string, vars map[string]any) (string, error) {
	var b strings.Builder
	r := []rune(template)
	for i := 0; i < len(r); i++ {
		switch r[i] {
		case '{':
			j := i + 1
			for j < len(r) && r[j] != '}' {
				j++
			}
			if j >= len(r) {
				return "", fail("unclosed expression")
			}
			s, err := expandExpr(string(r[i+1:j]), vars)
			if err != nil {
				return "", err
			}
			b.WriteString(s)
			i = j
		case '}':
			return "", fail("stray }")
		case '%':
			// RFC 6570 section 3.1: a pct-encoded triplet in a literal is copied as-is.
			if i+2 < len(r) && isHex(r[i+1]) && isHex(r[i+2]) {
				b.WriteString(string(r[i : i+3]))
				i += 2
			} else {
				b.WriteString("%25")
			}
		default:
			b.WriteString(enc(string(r[i]), true))
		}
	}
	return b.String(), nil
}
