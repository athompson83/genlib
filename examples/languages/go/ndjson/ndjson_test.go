// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 12 capability vectors; DO NOT EDIT by hand.

package ndjson

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func TestParseNdjson(t *testing.T) {
	for _, c := range []struct {
		text string
		want []any
	}{
		{"{\"a\":1}\n{\"b\":[1,2]}\n", []any{Object{{"a", json.Number("1")}}, Object{{"b", []any{json.Number("1"), json.Number("2")}}}}},
		{"\n  \n1\r\n\"x\"\ntrue\nnull\n", []any{json.Number("1"), "x", true, nil}},
		{"", []any{}},
		{"{\"k\":\"caf\u00e9\"}", []any{Object{{"k", "caf\u00e9"}}}},
	} {
		if got, err := ParseNdjson(c.text); err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParseNdjson(%q) = %#v, %v; want %#v", c.text, got, err, c.want)
		}
	}
	for _, c := range []struct {
		text string
		line int
	}{{"{\"a\":1}\n{bad}\n", 2}, {"1 2", 1}, {"{\"a\":1}\n\n[1,", 3}} {
		_, err := ParseNdjson(c.text)
		var le *LineError
		if !errors.As(err, &le) || le.Line != c.line {
			t.Errorf("ParseNdjson(%q) error = %v; want line %d", c.text, err, c.line)
		}
	}
}

func TestStringifyNdjson(t *testing.T) {
	for _, c := range []struct {
		values []any
		want   string
	}{
		{[]any{Object{{"a", json.Number("1")}, {"b", []any{true, nil, "x"}}}}, "{\"a\":1,\"b\":[true,null,\"x\"]}\n"},
		{[]any{json.Number("1"), "two", false}, "1\n\"two\"\nfalse\n"},
		{[]any{}, ""},
		{[]any{Object{{"q", "say \"hi\"\\ \n\t\x01 caf\u00e9"}}}, "{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u00e9\"}\n"},
		{[]any{Object{{"z", json.Number("1")}, {"a", json.Number("2")}}}, "{\"z\":1,\"a\":2}\n"},
		{[]any{[]any{}, Object{}}, "[]\n{}\n"},
		{[]any{json.Number("-42"), json.Number("0")}, "-42\n0\n"},
	} {
		got, err := StringifyNdjson(c.values)
		if err != nil || got != c.want {
			t.Errorf("StringifyNdjson(%#v) = %q, %v; want %q", c.values, got, err, c.want)
		}
		back, err := ParseNdjson(got)
		if err != nil || len(back) != len(c.values) {
			t.Errorf("round trip of %q = %v, %v", got, back, err)
		}
	}
	if got, _ := StringifyNdjson([]any{int64(-7), 2.5, map[string]any{"b": 1, "a": nil}}); got != "-7\n2.5\n{\"a\":null,\"b\":1}\n" {
		t.Errorf("native values = %q", got)
	}
	if _, err := StringifyNdjson([]any{struct{}{}}); !errors.Is(err, ErrValue) {
		t.Error("unsupported value should fail")
	}
}
