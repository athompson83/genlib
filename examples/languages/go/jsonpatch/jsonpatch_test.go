// SPDX-License-Identifier: Apache-2.0

package jsonpatch

import (
	"encoding/json"
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

func canon(t *testing.T, v any) string {
	t.Helper()
	s, err := Canonical(v)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestApply(t *testing.T) {
	for _, tc := range applyVectors {
		doc := decode(t, tc[0])
		got, err := ApplyPatch(doc, decode(t, tc[1]))
		if err != nil || canon(t, got) != tc[2] {
			t.Errorf("ApplyPatch(%s, %s) = %v, %v; want %s", tc[0], tc[1], got, err, tc[2])
		}
		if canon(t, doc) != canon(t, decode(t, tc[0])) {
			t.Errorf("ApplyPatch changed its input %s", tc[0])
		}
	}
}

func TestApplyInvalid(t *testing.T) {
	for _, tc := range applyInvalidVectors {
		doc := decode(t, tc[0])
		if got, err := ApplyPatch(doc, decode(t, tc[1])); err == nil {
			t.Errorf("ApplyPatch(%s, %s) = %v; want error", tc[0], tc[1], got)
		}
		if canon(t, doc) != tc[0] {
			t.Errorf("failed ApplyPatch changed its input to %s", canon(t, doc))
		}
	}
}

func TestPointer(t *testing.T) {
	for _, tc := range pointerVectors {
		got, err := GetPointer(decode(t, tc[0]), tc[1])
		if err != nil || canon(t, got) != tc[2] {
			t.Errorf("GetPointer(%q) = %v, %v; want %s", tc[1], got, err, tc[2])
		}
	}
	doc := decode(t, `{"foo":["bar","baz"],"m~n":8}`)
	for _, tc := range pointerInvalidVectors {
		if got, err := GetPointer(doc, tc[0]); err == nil {
			t.Errorf("GetPointer(%q) = %v; want error", tc[0], got)
		}
	}
}

func TestMerge(t *testing.T) {
	for _, tc := range mergeVectors {
		target := decode(t, tc[0])
		if got := canon(t, MergePatch(target, decode(t, tc[1]))); got != tc[2] {
			t.Errorf("MergePatch(%s, %s) = %s; want %s", tc[0], tc[1], got, tc[2])
		}
		if canon(t, target) != tc[0] {
			t.Errorf("MergePatch changed its input %s", tc[0])
		}
	}
}

func TestCreate(t *testing.T) {
	for _, tc := range createVectors {
		a, b := decode(t, tc[0]), decode(t, tc[1])
		p := CreatePatch(a, b)
		if got := canon(t, p); got != tc[2] {
			t.Errorf("CreatePatch(%s, %s) = %s; want %s", tc[0], tc[1], got, tc[2])
		}
		applied, err := ApplyPatch(a, any(p))
		if err != nil || !Equal(applied, b) {
			t.Errorf("ApplyPatch(a, CreatePatch(a, b)) = %v, %v; want %s", applied, err, tc[1])
		}
	}
}

func TestCanonical(t *testing.T) {
	for _, tc := range parseValidVectors {
		if got := canon(t, decode(t, tc[0])); got != tc[1] {
			t.Errorf("Canonical(%s) = %s; want %s", tc[0], got, tc[1])
		}
	}
	cases := map[string]any{
		`"\b\f\n\r\t\u001f\"\\/é"`: "\b\f\n\r\t\x1f\"\\/é",
		`[1.5,-0.25,3,7]`:          []any{1.5, -0.25, 3.0, 7},
		`{"Z":3,"a":1,"é":2}`:      map[string]any{"é": 2.0, "a": 1, "Z": int64(3)},
	}
	for want, v := range cases {
		if got := canon(t, v); got != want {
			t.Errorf("Canonical = %s; want %s", got, want)
		}
	}
	if _, err := Canonical(struct{}{}); err == nil {
		t.Error("Canonical of a non-JSON value want error")
	}
}

func TestEqual(t *testing.T) {
	if !Equal(decode(t, `{"a":[1,{"b":null}],"c":"x"}`), map[string]any{"c": "x", "a": []any{1, map[string]any{"b": nil}}}) {
		t.Error("deep equal with int and float numbers")
	}
	for _, pair := range [][2]any{{true, 1.0}, {false, 0.0}, {"1", 1.0}, {nil, false}, {[]any{}, map[string]any{}}} {
		if Equal(pair[0], pair[1]) {
			t.Errorf("Equal(%v, %v) want false", pair[0], pair[1])
		}
	}
}
