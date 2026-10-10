// SPDX-License-Identifier: Apache-2.0

package formschema

import (
	"reflect"
	"testing"
)

var schemaS = []Field{
	{Name: "name", Type: TypeString, Required: true, MinLength: Int(2), MaxLength: Int(5)},
	{Name: "age", Type: TypeInteger, Min: Float(18), Max: Float(120)},
	{Name: "email", Type: TypeEmail, Required: true},
	{Name: "plan", Type: TypeString, Enum: []string{"free", "pro"}},
	{Name: "code", Type: TypeString, Pattern: `[A-Z]{3}-\d{2}`},
	{Name: "start", Type: TypeDate},
}

func check(t *testing.T, values map[string]any, allowUnknown bool, want []FieldErrors) {
	t.Helper()
	got, err := Validate(schemaS, values, allowUnknown)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 && len(want) == 0 {
		return
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("values %v: got %v want %v", values, got, want)
	}
}

func TestVectors(t *testing.T) {
	check(t, map[string]any{"name": "Al", "age": 30, "email": "a@b.co", "plan": "pro", "code": "ABC-12", "start": "2024-02-29"}, false, nil)
	check(t, map[string]any{"name": "", "email": "bad"}, false,
		[]FieldErrors{{"name", []string{"required"}}, {"email", []string{"email"}}})
	check(t, map[string]any{"name": "Abcdef", "age": 17.5, "email": "a@b.co", "plan": "team", "code": "abc-12", "start": "2023-02-29"}, false,
		[]FieldErrors{{"name", []string{"maxLength"}}, {"age", []string{"type"}}, {"plan", []string{"enum"}}, {"code", []string{"pattern"}}, {"start", []string{"date"}}})
	check(t, map[string]any{"name": "Al", "email": "a@b.co", "age": "30"}, false,
		[]FieldErrors{{"age", []string{"type"}}})
	check(t, map[string]any{"name": "Al", "email": "a@b.co", "extra": 1}, false,
		[]FieldErrors{{"extra", []string{"unknown"}}})
	check(t, map[string]any{"name": "Al", "email": "a@b.co", "extra": 1}, true, nil)
	check(t, map[string]any{"name": "Al", "email": "a@b.co", "age": 121}, false,
		[]FieldErrors{{"age", []string{"max"}}})
	check(t, map[string]any{"name": "Ā", "email": "a@b.co"}, false,
		[]FieldErrors{{"name", []string{"minLength"}}})
}

func TestTypesAndSchemaErrors(t *testing.T) {
	s := []Field{{Name: "ok", Type: TypeBoolean, Required: true}, {Name: "n", Type: TypeNumber}}
	got, _ := Validate(s, map[string]any{"ok": "true", "n": true}, false)
	want := []FieldErrors{{"ok", []string{"type"}}, {"n", []string{"type"}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v", got)
	}
	got, _ = Validate(s, map[string]any{"ok": false, "n": 1.5}, false)
	if len(got) != 0 {
		t.Fatalf("got %v", got)
	}
	if _, err := Validate([]Field{{Name: "p", Type: TypeString, Pattern: "("}}, nil, false); err == nil {
		t.Fatal("accepted invalid pattern")
	}
	if _, err := Validate([]Field{{Name: "x", Type: "uuid"}}, nil, false); err == nil {
		t.Fatal("accepted unknown type")
	}
}
