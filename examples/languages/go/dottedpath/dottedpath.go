// SPDX-License-Identifier: Apache-2.0

// Package dottedpath reads and writes JSON-like data (map[string]any, []any,
// strings, numbers, booleans and nil, as produced by encoding/json) through
// dotted paths such as `user.addresses[0].city` or `a["x.y"]`.
//
// Grammar: names are separated by '.', run until '.' or '[' and may not be
// empty; `[n]` (no leading zeros except 0) is a list index; `["..."]` is a key
// with \" and \\ escapes. The empty path is the root. Set and Delete return
// new structures and never mutate their inputs.
package dottedpath

import (
	"errors"
	"math"
	"strconv"
)

// ErrPath is wrapped by every syntax and Set error.
var ErrPath = errors.New("dottedpath: invalid path")

type pathError struct{ msg string }

func (e *pathError) Error() string { return "dottedpath: " + e.msg }
func (e *pathError) Unwrap() error { return ErrPath }

func fail(msg string) error { return &pathError{msg} }

// ParsePath splits a path into string keys and int indexes; "" yields an empty slice (the root).
func ParsePath(p string) ([]any, error) {
	out := []any{}
	r := []rune(p)
	n := len(r)
	i := 0
	for i < n {
		c := r[i]
		if c == '[' {
			if i+1 < n && r[i+1] == '"' {
				j := i + 2
				var buf []rune
				for {
					if j >= n {
						return nil, fail("unterminated quoted key")
					}
					if r[j] == '\\' && j+1 < n {
						buf = append(buf, r[j+1])
						j += 2
						continue
					}
					if r[j] == '"' {
						break
					}
					buf = append(buf, r[j])
					j++
				}
				if j+1 >= n || r[j+1] != ']' {
					return nil, fail("expected ]")
				}
				out = append(out, string(buf))
				i = j + 2
			} else {
				j := i + 1
				for j < n && r[j] >= '0' && r[j] <= '9' {
					j++
				}
				digits := string(r[i+1 : j])
				if digits == "" || (len(digits) > 1 && digits[0] == '0') || j >= n || r[j] != ']' {
					return nil, fail("bad index")
				}
				idx, err := strconv.Atoi(digits)
				if err != nil {
					idx = math.MaxInt
				}
				out = append(out, idx)
				i = j + 1
			}
			needName := false
			if i < n && r[i] == '.' {
				i++
				needName = true
			}
			if needName && i >= n {
				return nil, fail("trailing dot")
			}
			continue
		}
		if c == '.' {
			return nil, fail("empty segment")
		}
		j := i
		for j < n && r[j] != '.' && r[j] != '[' {
			j++
		}
		out = append(out, string(r[i:j]))
		i = j
		if i < n && r[i] == '.' {
			i++
			if i >= n {
				return nil, fail("trailing dot")
			}
		}
	}
	return out, nil
}

func step(cur, k any) (any, bool) {
	if idx, ok := k.(int); ok {
		if l, ok := cur.([]any); ok && idx < len(l) {
			return l[idx], true
		}
		return nil, false
	}
	if m, ok := cur.(map[string]any); ok {
		v, found := m[k.(string)]
		return v, found
	}
	return nil, false
}

// Get returns the value at path, or def when a key or index is missing or a step meets the wrong type.
func Get(data any, path string, def any) (any, error) {
	keys, err := ParsePath(path)
	if err != nil {
		return nil, err
	}
	cur := data
	for _, k := range keys {
		v, ok := step(cur, k)
		if !ok {
			return def, nil
		}
		cur = v
	}
	return cur, nil
}

// Has reports whether path resolves to a value (which may be nil).
func Has(data any, path string) (bool, error) {
	keys, err := ParsePath(path)
	if err != nil {
		return false, err
	}
	cur := data
	for _, k := range keys {
		v, ok := step(cur, k)
		if !ok {
			return false, nil
		}
		cur = v
	}
	return true, nil
}

func deepCopy(v any) any {
	switch t := v.(type) {
	case map[string]any:
		m := make(map[string]any, len(t))
		for k, x := range t {
			m[k] = deepCopy(x)
		}
		return m
	case []any:
		l := make([]any, len(t))
		for i, x := range t {
			l[i] = deepCopy(x)
		}
		return l
	}
	return v
}

func set(cur any, keys []any, value any) (any, error) {
	if len(keys) == 0 {
		return deepCopy(value), nil
	}
	k, rest := keys[0], keys[1:]
	idx, isIndex := k.(int)
	if cur == nil {
		if isIndex {
			cur = []any{}
		} else {
			cur = map[string]any{}
		}
	}
	if isIndex {
		l, ok := cur.([]any)
		if !ok {
			return nil, fail("index on a non-list")
		}
		if idx > len(l) {
			return nil, fail("index out of range")
		}
		nl := deepCopy(l).([]any)
		var child any
		if idx < len(nl) {
			child = nl[idx]
		}
		v, err := set(child, rest, value)
		if err != nil {
			return nil, err
		}
		if idx == len(nl) {
			nl = append(nl, v)
		} else {
			nl[idx] = v
		}
		return nl, nil
	}
	m, ok := cur.(map[string]any)
	if !ok {
		return nil, fail("key on a non-object")
	}
	nm := deepCopy(m).(map[string]any)
	v, err := set(nm[k.(string)], rest, value)
	if err != nil {
		return nil, err
	}
	nm[k.(string)] = v
	return nm, nil
}

// Set returns a copy of data with value at path, creating maps or lists as needed; index == len appends.
func Set(data any, path string, value any) (any, error) {
	keys, err := ParsePath(path)
	if err != nil {
		return nil, err
	}
	return set(data, keys, value)
}

func del(cur any, keys []any) any {
	k, rest := keys[0], keys[1:]
	if _, ok := step(cur, k); !ok {
		return deepCopy(cur)
	}
	if idx, ok := k.(int); ok {
		l := cur.([]any)
		if len(rest) > 0 {
			nl := deepCopy(l).([]any)
			nl[idx] = del(l[idx], rest)
			return nl
		}
		nl := make([]any, 0, len(l)-1)
		for i, x := range l {
			if i != idx {
				nl = append(nl, deepCopy(x))
			}
		}
		return nl
	}
	m := cur.(map[string]any)
	nm := deepCopy(m).(map[string]any)
	if len(rest) > 0 {
		nm[k.(string)] = del(m[k.(string)], rest)
	} else {
		delete(nm, k.(string))
	}
	return nm
}

// Delete returns a copy of data without the key or index at path (lists shift); a missing path returns an unchanged copy.
func Delete(data any, path string) (any, error) {
	keys, err := ParsePath(path)
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, nil
	}
	return del(data, keys), nil
}
