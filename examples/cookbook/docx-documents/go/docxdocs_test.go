// SPDX-License-Identifier: Apache-2.0

package docxdocs

import (
	"strings"
	"testing"
)

func TestCreateReplaceExtract(t *testing.T) {
	created, err := CreateReport("Quarterly report", "Prepared for {customer}.",
		[][]string{{"Item", "Qty"}, {"Widgets", "3"}})
	if err != nil {
		t.Fatal(err)
	}
	if string(created[:2]) != "PK" {
		t.Fatal("not a zip package")
	}
	before, err := ExtractText(created)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(before, "{customer}") {
		t.Fatalf("placeholder missing before patch: %q", before)
	}

	patched, err := ReplacePlaceholders(created, map[string]string{"customer": "Ada <Lovelace> & Co"})
	if err != nil {
		t.Fatal(err)
	}
	after, err := ExtractText(patched)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Quarterly report", "Prepared for Ada <Lovelace> & Co.", "Item\tQty", "Widgets\t3"} {
		if !strings.Contains(after, want) {
			t.Errorf("missing %q in %q", want, after)
		}
	}
	if strings.Contains(after, "{customer}") {
		t.Errorf("placeholder not replaced: %q", after)
	}
}
