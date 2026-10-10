// SPDX-License-Identifier: Apache-2.0

package structureddata

import (
	"math"
	"strings"
	"testing"
)

const open = `<script type="application/ld+json">`

func TestJSONLDVector(t *testing.T) {
	got, err := JSONLDScript(Object{
		{"@context", "https://schema.org"}, {"@type", "Organization"}, {"name", "A&B </script>"},
		{"url", "https://ab.example"}, {"sameAs", []any{"https://x.com/ab"}},
	})
	want := open + `{"@context":"https://schema.org","@type":"Organization","name":"A\u0026B \u003c/script\u003e","url":"https://ab.example","sameAs":["https://x.com/ab"]}</script>`
	if err != nil || got != want {
		t.Fatalf("got %s err %v", got, err)
	}
}

func TestJSONLDValues(t *testing.T) {
	sep := string(rune(0x2028)) + "y" + string(rune(0x2029))
	got, err := JSONLDScript(Object{{"a", 1}, {"b", 2.5}, {"c", true}, {"d", nil},
		{"e", Object{{"f", []any{1, "x" + sep}}}}, {"g", "q\"\\\n"}, {"h", 3.0}})
	want := open + `{"a":1,"b":2.5,"c":true,"d":null,"e":{"f":[1,"x\u2028y\u2029"]},"g":"q\"\\\n","h":3}</script>`
	if err != nil || got != want {
		t.Fatalf("got %s err %v", got, err)
	}
	for _, v := range []float64{math.NaN(), math.Inf(1)} {
		if _, err := JSONLDScript(Object{{"n", v}}); err == nil || !strings.Contains(err.Error(), "finite") {
			t.Fatalf("accepted %v: %v", v, err)
		}
	}
	if _, err := JSONLDScript(Object{{"s", struct{}{}}}); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("struct: %v", err)
	}
	if _, err := JSONLDScript("x"); err == nil {
		t.Fatal("accepted a bare string")
	}
}

func TestMetaTagsVector(t *testing.T) {
	got, err := MetaTags(Meta{Title: `Tom & "Jerry"`, Description: "Cat <3 mouse", Canonical: "https://ex.com/tj", Image: "https://ex.com/tj.png", SiteName: "Ex"})
	want := strings.Join([]string{
		`<title>Tom &amp; &quot;Jerry&quot;</title>`,
		`<meta name="description" content="Cat &lt;3 mouse">`,
		`<link rel="canonical" href="https://ex.com/tj">`,
		`<meta property="og:title" content="Tom &amp; &quot;Jerry&quot;">`,
		`<meta property="og:description" content="Cat &lt;3 mouse">`,
		`<meta property="og:url" content="https://ex.com/tj">`,
		`<meta property="og:image" content="https://ex.com/tj.png">`,
		`<meta property="og:site_name" content="Ex">`,
		`<meta property="og:type" content="website">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="Tom &amp; &quot;Jerry&quot;">`,
		`<meta name="twitter:description" content="Cat &lt;3 mouse">`,
		`<meta name="twitter:image" content="https://ex.com/tj.png">`,
	}, "\n")
	if err != nil || got != want {
		t.Fatalf("got %s err %v", got, err)
	}
}

func TestMetaTagsTitleOnlyAndValidation(t *testing.T) {
	got, err := MetaTags(Meta{Title: "T"})
	want := "<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n" +
		"<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">"
	if err != nil || got != want || len(strings.Split(got, "\n")) != 5 {
		t.Fatalf("got %q err %v", got, err)
	}
	got, _ = MetaTags(Meta{Title: "T", Type: "article", TwitterCard: "summary", Locale: "en_US"})
	if !strings.Contains(got, "og:type\" content=\"article\">\n<meta property=\"og:locale\" content=\"en_US\">\n<meta name=\"twitter:card\" content=\"summary\">") {
		t.Fatalf("options: %q", got)
	}
	for _, m := range []Meta{{Title: "T", Canonical: "http://ex.com"}, {Title: "T", Image: "/a.png"}, {Title: "T", TwitterCard: "large"}, {Title: " "}} {
		if _, err := MetaTags(m); err == nil {
			t.Fatalf("accepted %+v", m)
		}
	}
}
