// SPDX-License-Identifier: Apache-2.0

// Package formschema validates submitted form values against an ordered
// schema on the server and returns stable error codes per field.
package formschema

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Field types.
const (
	TypeString  = "string"
	TypeNumber  = "number"
	TypeInteger = "integer"
	TypeBoolean = "boolean"
	TypeEmail   = "email"
	TypeDate    = "date"
)

// Field describes one form field. Nil pointers mean "no constraint".
// Pattern must match the whole value.
type Field struct {
	Name      string
	Type      string
	Required  bool
	MinLength *int
	MaxLength *int
	Min       *float64
	Max       *float64
	Pattern   string
	Enum      []string
}

// FieldErrors lists the error codes for one field.
type FieldErrors struct {
	Field string
	Codes []string
}

// Int and Float return pointers for optional constraints.
func Int(v int) *int           { return &v }
func Float(v float64) *float64 { return &v }

var dateShape = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}$`)

// Validate checks values against schema and returns only fields with errors,
// in schema order, followed by unknown keys ("unknown") when allowUnknown is
// false. Go maps are unordered, so unknown keys are reported sorted by name.
// A malformed schema returns an error.
func Validate(schema []Field, values map[string]any, allowUnknown bool) ([]FieldErrors, error) {
	known := make(map[string]bool, len(schema))
	patterns := make([]*regexp.Regexp, len(schema))
	for i, f := range schema {
		if f.Name == "" || known[f.Name] {
			return nil, fmt.Errorf("formschema: empty or duplicate field name %q", f.Name)
		}
		switch f.Type {
		case TypeString, TypeNumber, TypeInteger, TypeBoolean, TypeEmail, TypeDate:
		default:
			return nil, fmt.Errorf("formschema: field %q has unknown type %q", f.Name, f.Type)
		}
		known[f.Name] = true
		if f.Pattern != "" {
			re, err := regexp.Compile(`^(?:` + f.Pattern + `)$`)
			if err != nil {
				return nil, fmt.Errorf("formschema: field %q has invalid pattern: %w", f.Name, err)
			}
			patterns[i] = re
		}
	}
	var out []FieldErrors
	for i, f := range schema {
		if codes := checkField(f, patterns[i], values); len(codes) > 0 {
			out = append(out, FieldErrors{Field: f.Name, Codes: codes})
		}
	}
	if !allowUnknown {
		var unknown []string
		for k := range values {
			if !known[k] {
				unknown = append(unknown, k)
			}
		}
		sort.Strings(unknown)
		for _, k := range unknown {
			out = append(out, FieldErrors{Field: k, Codes: []string{"unknown"}})
		}
	}
	return out, nil
}

func checkField(f Field, pattern *regexp.Regexp, values map[string]any) []string {
	v, present := values[f.Name]
	if s, ok := v.(string); !present || v == nil || (ok && s == "") {
		if f.Required {
			return []string{"required"}
		}
		return nil
	}
	var codes []string
	switch f.Type {
	case TypeBoolean:
		if _, ok := v.(bool); !ok {
			return []string{"type"}
		}
	case TypeNumber, TypeInteger:
		n, ok := toNumber(v)
		if !ok || (f.Type == TypeInteger && n != math.Trunc(n)) {
			return []string{"type"}
		}
		if f.Min != nil && n < *f.Min {
			codes = append(codes, "min")
		}
		if f.Max != nil && n > *f.Max {
			codes = append(codes, "max")
		}
	default: // string, email, date
		s, ok := v.(string)
		if !ok {
			return []string{"type"}
		}
		length := utf8.RuneCountInString(s)
		if f.MinLength != nil && length < *f.MinLength {
			codes = append(codes, "minLength")
		}
		if f.MaxLength != nil && length > *f.MaxLength {
			codes = append(codes, "maxLength")
		}
		if pattern != nil && !pattern.MatchString(s) {
			codes = append(codes, "pattern")
		}
		if len(f.Enum) > 0 && !contains(f.Enum, s) {
			codes = append(codes, "enum")
		}
		if f.Type == TypeEmail && !validEmail(s) {
			codes = append(codes, "email")
		}
		if f.Type == TypeDate && !validDate(s) {
			codes = append(codes, "date")
		}
	}
	return codes
}

func toNumber(v any) (float64, bool) {
	var n float64
	switch x := v.(type) {
	case float64:
		n = x
	case float32:
		n = float64(x)
	case int:
		n = float64(x)
	case int8:
		n = float64(x)
	case int16:
		n = float64(x)
	case int32:
		n = float64(x)
	case int64:
		n = float64(x)
	case uint:
		n = float64(x)
	case uint8:
		n = float64(x)
	case uint16:
		n = float64(x)
	case uint32:
		n = float64(x)
	case uint64:
		n = float64(x)
	case json.Number: // a JSON number token decoded with UseNumber, not a string field
		f, err := x.Float64()
		if err != nil {
			return 0, false
		}
		n = f
	default:
		return 0, false
	}
	return n, !math.IsNaN(n) && !math.IsInf(n, 0)
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func validEmail(s string) bool {
	if utf8.RuneCountInString(s) > 254 || strings.Count(s, "@") != 1 || strings.IndexFunc(s, unicode.IsSpace) >= 0 {
		return false
	}
	at := strings.IndexByte(s, '@')
	return at > 0 && strings.Contains(s[at+1:], ".")
}

func validDate(s string) bool {
	if !dateShape.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}
