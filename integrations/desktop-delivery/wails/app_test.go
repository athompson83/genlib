// SPDX-License-Identifier: Apache-2.0
package main

import (
	"strings"
	"testing"
)

func TestNormalizeTitle(t *testing.T) {
	app := &App{}
	got, err := app.NormalizeTitle("  Label  ")
	if err != nil || got != "Label" {
		t.Fatalf("normalization failed: %q %v", got, err)
	}
	for _, input := range []string{" ", strings.Repeat("界", 201)} {
		if _, err := app.NormalizeTitle(input); err == nil {
			t.Fatal("invalid title accepted")
		}
	}
}
func TestSelectedTextAndTokenBounds(t *testing.T) {
	got, err := decodeText("fixture.md", []byte("Hello"))
	if err != nil || got.Contents != "Hello" {
		t.Fatalf("text: %v", err)
	}
	for _, name := range []string{"../a.txt", "path\\a.md", "a.exe"} {
		if _, err := decodeText(name, []byte("ok")); err == nil {
			t.Fatal("unsafe name accepted")
		}
	}
	for _, data := range [][]byte{{255}, {0}, make([]byte, maxTextBytes+1)} {
		if _, err := decodeText("a.txt", data); err == nil {
			t.Fatal("unsafe bytes accepted")
		}
	}
	for _, value := range []string{"", "line\nbreak", strings.Repeat("x", 2049)} {
		if validateToken(value) == nil {
			t.Fatal("invalid token accepted")
		}
	}
}
