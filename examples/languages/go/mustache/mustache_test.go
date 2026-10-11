// SPDX-License-Identifier: Apache-2.0

// Code generated from the wave 11 capability vectors; DO NOT EDIT by hand.

package mustache

import (
	"encoding/json"
	"errors"
	"testing"
)

const data = "{\"name\":\"Ada <3\",\"html\":\"<b>x</b>\",\"n\":3,\"f\":2.5,\"g\":4.0,\"t\":true,\"z\":0,\"e\":\"\",\"items\":[{\"name\":\"one\"},{\"name\":\"two\",\"extra\":\"!\"}],\"nums\":[1,2],\"user\":{\"first\":\"Grace\",\"tags\":[\"x\"]},\"empty\":[],\"obj\":{\"k\":\"v\"}}"

func ctx(t *testing.T) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(data), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestRender(t *testing.T) {
	d := ctx(t)
	for _, c := range [][2]string{
		{"Hello {{name}}!", "Hello Ada &lt;3!"},
		{"{{{html}}} vs {{html}}", "<b>x</b> vs &lt;b&gt;x&lt;/b&gt;"},
		{"{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]", "3 2.5 4 true 0 [] []"},
		{"{{#items}}<{{name}}{{extra}}>{{/items}}", "<one><two!>"},
		{"{{#nums}}{{.}},{{/nums}}", "1,2,"},
		{"{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}", "yeszeronone"},
		{"{{#user}}{{first}} {{name}}{{/user}}", "Grace Ada &lt;3"},
		{"{{user.first}} {{user.tags[0]}}", "Grace x"},
		{"a{{! comment }}b", "ab"},
		{"{{#obj}}{{k}}{{/obj}}", "v"},
		{"{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}", "[two]"},
		{"no tags", "no tags"},
	} {
		got, err := Render(c[0], d, true)
		if err != nil || got != c[1] {
			t.Errorf("Render(%q) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
	for _, c := range [][2]string{
		{"{{html}}", "<b>x</b>"},
	} {
		got, err := Render(c[0], d, false)
		if err != nil || got != c[1] {
			t.Errorf("Render(%q, raw) = %q, %v; want %q", c[0], got, err, c[1])
		}
	}
}

func TestInvalid(t *testing.T) {
	d := ctx(t)
	for _, s := range []string{"{{", "{{#a}}x", "{{#a}}x{{/b}}", "{{/a}}", "{{ bad name }}", "{{{x}}", "{{obj}}", "{{items}}"} {
		if _, err := Render(s, d, true); !errors.Is(err, ErrTemplate) {
			t.Errorf("Render(%q) error = %v", s, err)
		}
	}
}
