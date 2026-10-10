// SPDX-License-Identifier: Apache-2.0

// Package jsonpatch implements RFC 6901 JSON Pointer, RFC 6902 JSON Patch,
// RFC 7396 JSON Merge Patch, a deterministic patch generator and a canonical
// serializer, on values as produced by encoding/json: map[string]any, []any,
// string, float64, bool and nil. Integer types (int, int64, ...) are also
// accepted as numbers.
//
// Numbers compare numerically (1 == 1.0), booleans are never numbers and
// object key order is ignored. Canonical prints whole numbers without a
// decimal point and other floats in Go's shortest round-trip form
// (strconv 'g', -1). Functions never mutate their inputs.
package jsonpatch

import (
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
)

func fail(msg string) error { return errors.New("jsonpatch: " + msg) }

// number reports whether v is a JSON number and returns it as a float64.
func number(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int8:
		return float64(n), true
	case int16:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint8:
		return float64(n), true
	case uint16:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	}
	return 0, false
}

// Equal reports deep JSON equality.
func Equal(a, b any) bool {
	if x, ok := number(a); ok {
		y, ok := number(b)
		return ok && x == y
	}
	switch x := a.(type) {
	case nil:
		return b == nil
	case bool:
		y, ok := b.(bool)
		return ok && x == y
	case string:
		y, ok := b.(string)
		return ok && x == y
	case []any:
		y, ok := b.([]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for i := range x {
			if !Equal(x[i], y[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		y, ok := b.(map[string]any)
		if !ok || len(x) != len(y) {
			return false
		}
		for k, v := range x {
			w, ok := y[k]
			if !ok || !Equal(v, w) {
				return false
			}
		}
		return true
	}
	return false
}

func deepCopy(v any) any {
	switch x := v.(type) {
	case []any:
		out := make([]any, len(x))
		for i, e := range x {
			out[i] = deepCopy(e)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for k, e := range x {
			out[k] = deepCopy(e)
		}
		return out
	}
	return v
}

func parsePointer(p any) ([]string, error) {
	s, ok := p.(string)
	if !ok {
		return nil, fail("pointer must be a string")
	}
	if s == "" {
		return []string{}, nil
	}
	if s[0] != '/' {
		return nil, fail(`pointer must be empty or start with "/"`)
	}
	parts := strings.Split(s[1:], "/")
	for i, t := range parts {
		for k := 0; k < len(t); k++ {
			if t[k] == '~' && (k+1 == len(t) || (t[k+1] != '0' && t[k+1] != '1')) {
				return nil, fail("bad escape in pointer token " + strconv.Quote(t))
			}
		}
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(t, "~1", "/"), "~0", "~")
	}
	return parts, nil
}

func escapeToken(t string) string {
	return strings.ReplaceAll(strings.ReplaceAll(t, "~", "~0"), "/", "~1")
}

func index(token string, n int, allowEnd bool) (int, error) {
	if allowEnd && token == "-" {
		return n, nil
	}
	valid := token != "" && (token == "0" || token[0] != '0')
	for k := 0; k < len(token); k++ {
		if token[k] < '0' || token[k] > '9' {
			valid = false
		}
	}
	if !valid {
		return 0, fail("bad array index " + strconv.Quote(token))
	}
	i, err := strconv.Atoi(token)
	if err != nil || i > n || (i == n && !allowEnd) {
		return 0, fail("array index out of range: " + token)
	}
	return i, nil
}

func child(cur any, t string) (any, error) {
	switch c := cur.(type) {
	case map[string]any:
		v, ok := c[t]
		if !ok {
			return nil, fail("no member " + strconv.Quote(t))
		}
		return v, nil
	case []any:
		i, err := index(t, len(c), false)
		if err != nil {
			return nil, err
		}
		return c[i], nil
	}
	return nil, fail("cannot index a scalar")
}

func get(doc any, tokens []string) (any, error) {
	cur := doc
	for _, t := range tokens {
		var err error
		if cur, err = child(cur, t); err != nil {
			return nil, err
		}
	}
	return cur, nil
}

// GetPointer resolves an RFC 6901 pointer ("" is the whole document). It
// returns the value inside doc itself, not a copy.
func GetPointer(doc any, pointer string) (any, error) {
	tokens, err := parsePointer(pointer)
	if err != nil {
		return nil, err
	}
	return get(doc, tokens)
}

// add returns cur with value added at tokens (cur is a private copy).
func add(cur any, tokens []string, value any) (any, error) {
	if len(tokens) == 0 {
		return value, nil
	}
	t := tokens[0]
	if len(tokens) > 1 {
		c, err := child(cur, t)
		if err != nil {
			return nil, err
		}
		nc, err := add(c, tokens[1:], value)
		if err != nil {
			return nil, err
		}
		return put(cur, t, nc), nil
	}
	switch c := cur.(type) {
	case map[string]any:
		c[t] = value
		return c, nil
	case []any:
		i, err := index(t, len(c), true)
		if err != nil {
			return nil, err
		}
		c = append(c, nil)
		copy(c[i+1:], c[i:])
		c[i] = value
		return c, nil
	}
	return nil, fail("cannot add to a scalar")
}

// put stores an existing child back after it was rebuilt.
func put(cur any, t string, v any) any {
	switch c := cur.(type) {
	case map[string]any:
		c[t] = v
	case []any:
		i, _ := strconv.Atoi(t)
		c[i] = v
	}
	return cur
}

// remove returns cur without the value at tokens, and that value.
func remove(cur any, tokens []string) (any, any, error) {
	if len(tokens) == 0 {
		return nil, nil, fail("cannot remove the root")
	}
	t := tokens[0]
	if len(tokens) > 1 {
		c, err := child(cur, t)
		if err != nil {
			return nil, nil, err
		}
		nc, removed, err := remove(c, tokens[1:])
		if err != nil {
			return nil, nil, err
		}
		return put(cur, t, nc), removed, nil
	}
	switch c := cur.(type) {
	case map[string]any:
		v, ok := c[t]
		if !ok {
			return nil, nil, fail("no member " + strconv.Quote(t))
		}
		delete(c, t)
		return c, v, nil
	case []any:
		i, err := index(t, len(c), false)
		if err != nil {
			return nil, nil, err
		}
		v := c[i]
		return append(c[:i], c[i+1:]...), v, nil
	}
	return nil, nil, fail("cannot remove from a scalar")
}

func hasPrefix(path, prefix []string) bool {
	if len(prefix) > len(path) {
		return false
	}
	for i := range prefix {
		if path[i] != prefix[i] {
			return false
		}
	}
	return true
}

// ApplyPatch applies an RFC 6902 patch (a []any of operation objects)
// atomically and returns a new document; doc is never changed. Members other
// than op, path, value and from are ignored.
func ApplyPatch(doc any, patch any) (any, error) {
	ops, ok := patch.([]any)
	if !ok {
		return nil, fail("patch must be an array")
	}
	doc = deepCopy(doc)
	for _, o := range ops {
		op, ok := o.(map[string]any)
		if !ok {
			return nil, fail(`operation needs "op"`)
		}
		kind, ok := op["op"].(string)
		if !ok {
			return nil, fail(`operation needs "op"`)
		}
		rawPath, ok := op["path"]
		if !ok {
			return nil, fail(`operation needs "path"`)
		}
		path, err := parsePointer(rawPath)
		if err != nil {
			return nil, err
		}
		value, hasValue := op["value"]
		rawFrom, hasFrom := op["from"]
		if (kind == "add" || kind == "replace" || kind == "test") && !hasValue {
			return nil, fail(kind + ` needs "value"`)
		}
		if (kind == "move" || kind == "copy") && !hasFrom {
			return nil, fail(kind + ` needs "from"`)
		}
		switch kind {
		case "add":
			doc, err = add(doc, path, deepCopy(value))
		case "remove":
			doc, _, err = remove(doc, path)
		case "replace":
			if _, err = get(doc, path); err == nil {
				if len(path) == 0 {
					doc = deepCopy(value)
				} else if doc, _, err = remove(doc, path); err == nil {
					doc, err = add(doc, path, deepCopy(value))
				}
			}
		case "move":
			var from []string
			if from, err = parsePointer(rawFrom); err != nil {
				break
			}
			if len(from) == len(path) && hasPrefix(path, from) {
				_, err = get(doc, from)
				break
			}
			if hasPrefix(path, from) {
				err = fail("cannot move a value into itself")
				break
			}
			var v any
			if doc, v, err = remove(doc, from); err == nil {
				doc, err = add(doc, path, v)
			}
		case "copy":
			var from []string
			var v any
			if from, err = parsePointer(rawFrom); err == nil {
				if v, err = get(doc, from); err == nil {
					doc, err = add(doc, path, deepCopy(v))
				}
			}
		case "test":
			var v any
			if v, err = get(doc, path); err == nil && !Equal(v, value) {
				err = fail("test failed at " + rawPath.(string))
			}
		default:
			err = fail("unknown op " + strconv.Quote(kind))
		}
		if err != nil {
			return nil, err
		}
	}
	return doc, nil
}

// MergePatch applies an RFC 7396 merge patch and returns a new value.
func MergePatch(target, patch any) any {
	p, ok := patch.(map[string]any)
	if !ok {
		return deepCopy(patch)
	}
	out, ok := deepCopy(target).(map[string]any)
	if !ok {
		out = map[string]any{}
	}
	for k, v := range p {
		if v == nil {
			delete(out, k)
		} else {
			out[k] = MergePatch(out[k], v)
		}
	}
	return out
}

func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys) // byte order of UTF-8 equals code point order
	return keys
}

// CreatePatch returns a deterministic RFC 6902 patch ([]any of
// map[string]any operations) that turns a into b: object keys in code point
// order (remove, add or recurse), array indexes compared pairwise, then
// surplus indexes removed from the end and missing ones added; any other
// difference is a replace. ApplyPatch(a, CreatePatch(a, b)) equals b.
func CreatePatch(a, b any) []any {
	return create(a, b, "", []any{})
}

func create(a, b any, path string, ops []any) []any {
	if Equal(a, b) {
		return ops
	}
	ma, okA := a.(map[string]any)
	mb, okB := b.(map[string]any)
	if okA && okB {
		union := map[string]any{}
		for k := range ma {
			union[k] = nil
		}
		for k := range mb {
			union[k] = nil
		}
		for _, k := range sortedKeys(union) {
			p := path + "/" + escapeToken(k)
			va, inA := ma[k]
			vb, inB := mb[k]
			switch {
			case !inB:
				ops = append(ops, map[string]any{"op": "remove", "path": p})
			case !inA:
				ops = append(ops, map[string]any{"op": "add", "path": p, "value": deepCopy(vb)})
			default:
				ops = create(va, vb, p, ops)
			}
		}
		return ops
	}
	la, okA := a.([]any)
	lb, okB := b.([]any)
	if okA && okB {
		n := len(la)
		if len(lb) < n {
			n = len(lb)
		}
		for i := 0; i < n; i++ {
			ops = create(la[i], lb[i], path+"/"+strconv.Itoa(i), ops)
		}
		for i := len(la) - 1; i >= len(lb); i-- {
			ops = append(ops, map[string]any{"op": "remove", "path": path + "/" + strconv.Itoa(i)})
		}
		for i := len(la); i < len(lb); i++ {
			ops = append(ops, map[string]any{"op": "add", "path": path + "/" + strconv.Itoa(i), "value": deepCopy(lb[i])})
		}
		return ops
	}
	return append(ops, map[string]any{"op": "replace", "path": path, "value": deepCopy(b)})
}

// Canonical returns compact JSON with object keys in code point order, whole
// numbers without a decimal point and strings escaped only where JSON
// requires (", \, and characters below U+0020). It fails on NaN, infinities
// and values that are not JSON.
func Canonical(v any) (string, error) {
	var b strings.Builder
	if err := write(&b, v); err != nil {
		return "", err
	}
	return b.String(), nil
}

func write(b *strings.Builder, v any) error {
	if n, ok := number(v); ok {
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return fail("NaN and infinities are not JSON")
		}
		switch {
		case n == 0:
			b.WriteByte('0')
		case n == math.Trunc(n):
			b.WriteString(strconv.FormatFloat(n, 'f', -1, 64))
		default:
			b.WriteString(strconv.FormatFloat(n, 'g', -1, 64))
		}
		return nil
	}
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(x))
	case string:
		writeString(b, x)
	case []any:
		b.WriteByte('[')
		for i, e := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := write(b, e); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		b.WriteByte('{')
		for i, k := range sortedKeys(x) {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, k)
			b.WriteByte(':')
			if err := write(b, x[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	default:
		return fail("not a JSON value")
	}
	return nil
}

func writeString(b *strings.Builder, s string) {
	const hex = "0123456789abcdef"
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if c < 0x20 {
				b.WriteString(`\u00`)
				b.WriteByte(hex[c>>4])
				b.WriteByte(hex[c&15])
			} else {
				b.WriteByte(c)
			}
		}
	}
	b.WriteByte('"')
}
