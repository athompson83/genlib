// SPDX-License-Identifier: Apache-2.0

package pdfforms

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

// formJSON describes a one-page form; pdfcpu renders it at test time.
const formJSON = `{
  "paper": "A4P",
  "origin": "LowerLeft",
  "fonts": {"input": {"name": "Helvetica", "size": 12}},
  "pages": {"1": {"content": {
    "textfield": [{"id": "name", "value": "", "pos": [150, 700], "width": 200, "font": {"name": "$input"}}],
    "checkbox":  [{"id": "subscribe", "value": false, "pos": [150, 660], "width": 12}],
    "combobox":  [{"id": "plan", "value": "free", "options": ["free", "pro", "team"], "edit": false,
                   "pos": [150, 620], "width": 100, "font": {"name": "$input"}}]
  }}}
}`

func makeForm(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	if err := api.Create(context.Background(), nil, strings.NewReader(formJSON), &buf, conf()); err != nil {
		t.Fatalf("create form: %v", err)
	}
	return buf.Bytes()
}

func byName(t *testing.T, pdf []byte) map[string]Field {
	t.Helper()
	fields, err := ListFields(context.Background(), bytes.NewReader(pdf))
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	m := map[string]Field{}
	for _, f := range fields {
		m[f.Name] = f
	}
	return m
}

func TestListFields(t *testing.T) {
	m := byName(t, makeForm(t))
	if m["name"].Kind != "text" || m["subscribe"].Kind != "checkbox" || m["plan"].Kind != "choice" {
		t.Fatalf("unexpected kinds: %+v", m)
	}
	if strings.Join(m["plan"].Options, ",") != "free,pro,team" {
		t.Fatalf("options: %v", m["plan"].Options)
	}
}

func TestFillAndReadBack(t *testing.T) {
	src := makeForm(t)
	var out bytes.Buffer
	err := Fill(context.Background(), src, &out, map[string]any{"name": "Ada Lovelace", "subscribe": true, "plan": "pro"})
	if err != nil {
		t.Fatalf("fill: %v", err)
	}
	m := byName(t, out.Bytes())
	if m["name"].Value != "Ada Lovelace" || m["subscribe"].Value != "true" || m["plan"].Value != "pro" {
		t.Fatalf("read back: %+v", m)
	}
}

func TestRejectsUnknownAndInvalid(t *testing.T) {
	src := makeForm(t)
	var out bytes.Buffer
	if err := Fill(context.Background(), src, &out, map[string]any{"nmae": "x"}); err == nil {
		t.Fatal("expected unknown-field error")
	}
	if err := Fill(context.Background(), src, &out, map[string]any{"plan": "enterprise"}); err == nil {
		t.Fatal("expected invalid-option error")
	}
}

func TestLock(t *testing.T) {
	var out bytes.Buffer
	if err := Lock(context.Background(), makeForm(t), &out); err != nil {
		t.Fatalf("lock: %v", err)
	}
	fields, err := api.FormFields(context.Background(), bytes.NewReader(out.Bytes()), conf())
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range fields {
		if !f.Locked {
			t.Fatalf("field %s not locked", f.Name)
		}
	}
}
