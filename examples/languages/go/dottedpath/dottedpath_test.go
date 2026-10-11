// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package dottedpath

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"
)

func decode(t *testing.T, s string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatalf("decode %q: %v", s, err)
	}
	return v
}

const data = "{\"user\":{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"addr\":[{\"city\":\"Paris\"},{\"city\":\"Rome\"}],\"x.y\":{\"z\":1}},\"n\":0,\"nil\":null}"

func TestParsePath(t *testing.T) {
	for _, c := range []struct {
		path string
		want []any
	}{
		{"", []any{}},
		{"a", []any{"a"}},
		{"a.b.c", []any{"a", "b", "c"}},
		{"a[0]", []any{"a", 0}},
		{"a[0][1].b", []any{"a", 0, 1, "b"}},
		{"[\"x.y\"].z", []any{"x.y", "z"}},
		{"user[\"x.y\"].z", []any{"user", "x.y", "z"}},
		{"a[\"q\\\"t\"]", []any{"a", "q\"t"}},
	} {
		got, err := ParsePath(c.path)
		if err != nil || !reflect.DeepEqual(got, c.want) {
			t.Errorf("ParsePath(%q) = %#v, %v; want %#v", c.path, got, err, c.want)
		}
	}
}

func TestGetHas(t *testing.T) {
	doc := decode(t, data)
	for _, c := range [][2]string{
		{"user.name", "\"Ada\""},
		{"user.tags[1]", "\"b\""},
		{"user.addr[1].city", "\"Rome\""},
		{"user[\"x.y\"].z", "1"},
		{"user.missing", "\"DEF\""},
		{"user.tags[5]", "\"DEF\""},
		{"user.name.first", "\"DEF\""},
		{"n", "0"},
		{"nil", "null"},
		{"", "{\"user\":{\"name\":\"Ada\",\"tags\":[\"a\",\"b\"],\"addr\":[{\"city\":\"Paris\"},{\"city\":\"Rome\"}],\"x.y\":{\"z\":1}},\"n\":0,\"nil\":null}"},
		{"user.tags.0", "\"DEF\""},
	} {
		got, err := Get(doc, c[0], "DEF")
		if err != nil || !reflect.DeepEqual(got, decode(t, c[1])) {
			t.Errorf("Get(%q) = %#v, %v; want %s", c[0], got, err, c[1])
		}
	}
	for _, c := range []struct {
		path string
		want bool
	}{
		{"user.name", true},
		{"nil", true},
		{"user.nope", false},
		{"user.tags[2]", false},
	} {
		got, err := Has(doc, c.path)
		if err != nil || got != c.want {
			t.Errorf("Has(%q) = %v, %v; want %v", c.path, got, err, c.want)
		}
	}
	if !reflect.DeepEqual(doc, decode(t, data)) {
		t.Error("input mutated")
	}
}

func TestSet(t *testing.T) {
	for _, c := range [][4]string{
		{"{}", "a.b", "1", "{\"a\":{\"b\":1}}"},
		{"{}", "a[0].b", "1", "{\"a\":[{\"b\":1}]}"},
		{"{\"a\":[1]}", "a[1]", "2", "{\"a\":[1,2]}"},
		{"{\"a\":{\"b\":1}}", "a.c", "[1,2]", "{\"a\":{\"b\":1,\"c\":[1,2]}}"},
		{"null", "x", "true", "{\"x\":true}"},
		{"{\"a\":1}", "", "{\"z\":2}", "{\"z\":2}"},
		{"{}", "[\"k.v\"]", "3", "{\"k.v\":3}"},
	} {
		in := decode(t, c[0])
		got, err := Set(in, c[1], decode(t, c[2]))
		if err != nil || !reflect.DeepEqual(got, decode(t, c[3])) {
			t.Errorf("Set(%s, %q, %s) = %#v, %v; want %s", c[0], c[1], c[2], got, err, c[3])
		}
		if !reflect.DeepEqual(in, decode(t, c[0])) {
			t.Errorf("Set mutated %s", c[0])
		}
	}
	for _, c := range [][3]string{
		{"{\"a\":[1]}", "a[3]", "0"},
		{"{\"a\":1}", "a.b", "0"},
		{"{\"a\":{}}", "a[0]", "0"},
	} {
		if _, err := Set(decode(t, c[0]), c[1], decode(t, c[2])); !errors.Is(err, ErrPath) {
			t.Errorf("Set(%s, %q) error = %v", c[0], c[1], err)
		}
	}
}

func TestDelete(t *testing.T) {
	for _, c := range [][3]string{
		{"{\"a\":{\"b\":1,\"c\":2}}", "a.b", "{\"a\":{\"c\":2}}"},
		{"{\"a\":[1,2,3]}", "a[0]", "{\"a\":[2,3]}"},
		{"{\"a\":1}", "b", "{\"a\":1}"},
		{"{\"a\":[1]}", "a[4]", "{\"a\":[1]}"},
	} {
		in := decode(t, c[0])
		got, err := Delete(in, c[1])
		if err != nil || !reflect.DeepEqual(got, decode(t, c[2])) {
			t.Errorf("Delete(%s, %q) = %#v, %v; want %s", c[0], c[1], got, err, c[2])
		}
		if !reflect.DeepEqual(in, decode(t, c[0])) {
			t.Errorf("Delete mutated %s", c[0])
		}
	}
}

func TestInvalidParse(t *testing.T) {
	for _, p := range []string{"a.", ".a", "a..b", "a[01]", "a[x]", "a[\"x", "a[1", "a[-1]"} {
		if _, err := ParsePath(p); !errors.Is(err, ErrPath) {
			t.Errorf("ParsePath(%q) error = %v", p, err)
		}
	}
}
