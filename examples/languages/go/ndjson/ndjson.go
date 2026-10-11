// SPDX-License-Identifier: Apache-2.0

// Package ndjson parses and writes newline-delimited JSON.
//
// ParseNdjson splits on LF (a trailing CR on a line is removed), skips lines
// that are empty or only spaces and tabs, and requires every other line to be
// exactly one JSON value. Objects decode to Object so member order survives a
// round trip; numbers decode to json.Number. StringifyNdjson writes each value
// compactly with object keys in insertion order (map[string]any keys are
// sorted), escapes only '"', '\' and U+0000..U+001F (short escapes or
// lowercase \u00xx), keeps non-ASCII as UTF-8, and ends every value with LF.
package ndjson

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"sort"
	"strconv"
	"strings"
)

// ErrValue is returned by StringifyNdjson for an unsupported value.
var ErrValue = errors.New("ndjson: unsupported value")

// Member is one key/value pair of an Object.
type Member struct {
	Key   string
	Value any
}

// Object is a JSON object whose members keep their order.
type Object []Member

// LineError reports the 1-based line that is not a single JSON value.
type LineError struct {
	Line int
	Err  error
}

func (e *LineError) Error() string { return fmt.Sprintf("ndjson: line %d: %v", e.Line, e.Err) }
func (e *LineError) Unwrap() error { return e.Err }

func decodeValue(dec *json.Decoder) (any, error) {
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	d, ok := tok.(json.Delim)
	if !ok {
		return tok, nil
	}
	switch d {
	case '[':
		arr := []any{}
		for dec.More() {
			v, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			arr = append(arr, v)
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return arr, nil
	case '{':
		obj := Object{}
		for dec.More() {
			kt, err := dec.Token()
			if err != nil {
				return nil, err
			}
			key, ok := kt.(string)
			if !ok {
				return nil, errors.New("object key is not a string")
			}
			v, err := decodeValue(dec)
			if err != nil {
				return nil, err
			}
			obj = append(obj, Member{key, v})
		}
		if _, err := dec.Token(); err != nil {
			return nil, err
		}
		return obj, nil
	}
	return nil, fmt.Errorf("unexpected %v", d)
}

func parseLine(line string) (any, error) {
	dec := json.NewDecoder(strings.NewReader(line))
	dec.UseNumber()
	v, err := decodeValue(dec)
	if err == io.EOF {
		return nil, io.ErrUnexpectedEOF
	}
	if err != nil {
		return nil, err
	}
	if _, err := dec.Token(); err != io.EOF {
		return nil, errors.New("more than one value")
	}
	return v, nil
}

// ParseNdjson parses one JSON value per non-blank line; errors are *LineError.
func ParseNdjson(text string) ([]any, error) {
	out := []any{}
	for i, line := range strings.Split(text, "\n") {
		line = strings.TrimSuffix(line, "\r")
		if strings.Trim(line, " \t") == "" {
			continue
		}
		v, err := parseLine(line)
		if err != nil {
			return nil, &LineError{Line: i + 1, Err: err}
		}
		out = append(out, v)
	}
	return out, nil
}

func writeString(b *strings.Builder, s string) {
	b.WriteByte('"')
	for _, c := range s {
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
				fmt.Fprintf(b, `\u%04x`, c)
			} else {
				b.WriteRune(c)
			}
		}
	}
	b.WriteByte('"')
}

func write(b *strings.Builder, v any) error {
	switch t := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(t))
	case json.Number:
		b.WriteString(t.String())
	case int:
		b.WriteString(strconv.Itoa(t))
	case int64:
		b.WriteString(strconv.FormatInt(t, 10))
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return ErrValue
		}
		b.WriteString(strconv.FormatFloat(t, 'g', -1, 64))
	case string:
		writeString(b, t)
	case []any:
		b.WriteByte('[')
		for i, x := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := write(b, x); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case Object:
		b.WriteByte('{')
		for i, m := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			writeString(b, m.Key)
			b.WriteByte(':')
			if err := write(b, m.Value); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		obj := make(Object, len(keys))
		for i, k := range keys {
			obj[i] = Member{k, t[k]}
		}
		return write(b, obj)
	default:
		return ErrValue
	}
	return nil
}

// StringifyNdjson writes each value compactly followed by a newline.
func StringifyNdjson(values []any) (string, error) {
	var b strings.Builder
	for _, v := range values {
		if err := write(&b, v); err != nil {
			return "", err
		}
		b.WriteByte('\n')
	}
	return b.String(), nil
}
