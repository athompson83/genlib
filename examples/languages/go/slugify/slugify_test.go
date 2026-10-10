// SPDX-License-Identifier: Apache-2.0

package slugify

import "testing"

func TestCases(t *testing.T) {
	for _, tc := range caseVectors {
		if got, err := Slugify(tc.text, tc.separator, tc.maxLength); err != nil || got != tc.want {
			t.Errorf("Slugify(%q, %q, %d) = %q, %v; want %q", tc.text, tc.separator, tc.maxLength, got, err, tc.want)
		}
	}
}

func TestInvalid(t *testing.T) {
	for _, tc := range invalidVectors {
		if got, err := Slugify(tc.text, tc.separator, tc.maxLength); err == nil {
			t.Errorf("Slugify(%q, %q, %d) = %q; want error", tc.text, tc.separator, tc.maxLength, got)
		}
	}
}

func TestUnique(t *testing.T) {
	for _, tc := range uniqueVectors {
		taken := map[string]bool{}
		for _, s := range tc.taken {
			taken[s] = true
		}
		if got, err := UniqueSlug(tc.base, taken, "-"); err != nil || got != tc.want {
			t.Errorf("UniqueSlug(%q, %v) = %q, %v; want %q", tc.base, tc.taken, got, err, tc.want)
		}
	}
	if _, err := UniqueSlug("", nil, "-"); err == nil {
		t.Error("empty base want error")
	}
}

func TestTable(t *testing.T) {
	if len(tableVectors) != 190 {
		t.Fatalf("table vectors have %d entries", len(tableVectors))
	}
	for r := rune(0xC0); r <= 0x17F; r++ {
		want, ok := tableVectors[r]
		if !ok {
			want = string(r)
		}
		if got := transliterate(r); got != want {
			t.Errorf("transliterate(%U) = %q; want %q", r, got, want)
		}
	}
}
