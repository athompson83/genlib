// SPDX-License-Identifier: Apache-2.0

package pdftext

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// Two pages of known text, rendered by pdfcpu (Apache-2.0) at test time.
const docJSON = `{
  "paper": "A4P",
  "origin": "LowerLeft",
  "pages": {
    "1": {"content": {"text": [{"value": "Hello from page one", "pos": [72, 750], "font": {"name": "Helvetica", "size": 14}}]}},
    "2": {"content": {"text": [{"value": "Second page text", "pos": [72, 750], "font": {"name": "Helvetica", "size": 14}}]}}
  }
}`

func makePDF(t *testing.T) []byte {
	t.Helper()
	var created, out bytes.Buffer
	conf := model.NewDefaultConfiguration()
	if err := api.Create(context.Background(), nil, strings.NewReader(docJSON), &created, conf); err != nil {
		t.Fatalf("create: %v", err)
	}
	props := map[string]string{"Title": "Cookbook Fixture", "Author": "Genlib"}
	if err := api.AddProperties(context.Background(), bytes.NewReader(created.Bytes()), &out, props, conf); err != nil {
		t.Fatalf("properties: %v", err)
	}
	return out.Bytes()
}

func TestExtract(t *testing.T) {
	res, err := Extract(makePDF(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Pages) != 2 {
		t.Fatalf("pages = %d", len(res.Pages))
	}
	if !strings.Contains(res.Pages[0], "Hello from page one") || strings.Contains(res.Pages[0], "Second") {
		t.Fatalf("page 1 = %q", res.Pages[0])
	}
	if !strings.Contains(res.Pages[1], "Second page text") {
		t.Fatalf("page 2 = %q", res.Pages[1])
	}
	if res.Metadata["Title"] != "Cookbook Fixture" || res.Metadata["Author"] != "Genlib" {
		t.Fatalf("metadata = %v", res.Metadata)
	}
}

func TestRejectsGarbage(t *testing.T) {
	if _, err := Extract([]byte("not a pdf")); err == nil {
		t.Fatal("expected error")
	}
}
