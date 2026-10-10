// SPDX-License-Identifier: Apache-2.0

package seofiles

import (
	"strings"
	"testing"
)

func f(v float64) *float64 { return &v }

var aiGroup = func() string {
	var sb strings.Builder
	for _, a := range []string{"GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
		"Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent"} {
		sb.WriteString("User-agent: " + a + "\n")
	}
	return sb.String()
}()

func TestSitemapVector(t *testing.T) {
	got, err := SitemapXML([]Entry{
		{Loc: "https://example.com/", LastMod: "2026-10-01", ChangeFreq: "weekly", Priority: f(1)},
		{Loc: "https://example.com/a?x=1&y=2"},
	})
	want := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" +
		"  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n" +
		"    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n"
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestSitemapEscapingPriorityAndValidation(t *testing.T) {
	got, _ := SitemapXML([]Entry{{Loc: `https://example.com/it's<"x">`}})
	if !strings.Contains(got, "<loc>https://example.com/it&apos;s&lt;&quot;x&quot;&gt;</loc>") {
		t.Fatalf("escaping: %q", got)
	}
	for p, want := range map[float64]string{0: "0.0", 0.25: "0.3", 0.85: "0.9", 0.5: "0.5"} {
		got, _ := SitemapXML([]Entry{{Loc: "https://e.com/", Priority: f(p)}})
		if !strings.Contains(got, "<priority>"+want+"</priority>") {
			t.Fatalf("priority %v: %q", p, got)
		}
	}
	bad := []Entry{{Loc: "/relative"}, {Loc: "ftp://e.com/"}, {Loc: "https://e.com/", LastMod: "2026-13-01"},
		{Loc: "https://e.com/", LastMod: "2026-1-01"}, {Loc: "https://e.com/", ChangeFreq: "often"},
		{Loc: "https://e.com/", Priority: f(1.1)}, {Loc: "https://e.com/", Priority: f(-0.1)}}
	for _, e := range bad {
		if _, err := SitemapXML([]Entry{e}); err == nil {
			t.Fatalf("accepted %+v", e)
		}
	}
	if _, err := SitemapXML(make([]Entry, 50001)); err == nil || !strings.Contains(err.Error(), "50000") {
		t.Fatalf("limit: %v", err)
	}
}

func TestRobotsVectors(t *testing.T) {
	rules := []Rule{{UserAgent: "*", Disallow: []string{"/admin"}}}
	cases := []struct {
		ai       string
		sitemaps []string
		want     string
	}{
		{AIDisallow, []string{"https://example.com/sitemap.xml"}, "User-agent: *\nDisallow: /admin\n\n" + aiGroup + "Disallow: /\n\nSitemap: https://example.com/sitemap.xml\n"},
		{AIDefault, nil, "User-agent: *\nDisallow: /admin\n"},
		{AIAllow, nil, "User-agent: *\nDisallow: /admin\n\n" + aiGroup + "Allow: /\n"},
	}
	for _, c := range cases {
		if got, err := RobotsTxt(rules, c.ai, c.sitemaps); err != nil || got != c.want {
			t.Fatalf("%s: got %q err %v", c.ai, got, err)
		}
	}
	got, err := RobotsTxt([]Rule{{UserAgent: "Bingbot", Allow: []string{"/public", "*.css"}, Disallow: []string{"/"}}}, "", nil)
	if err != nil || got != "User-agent: Bingbot\nAllow: /public\nAllow: *.css\nDisallow: /\n" {
		t.Fatalf("got %q err %v", got, err)
	}
}

func TestRobotsValidation(t *testing.T) {
	rules := []Rule{{UserAgent: "*", Disallow: []string{"/admin"}}}
	checks := []struct {
		rules    []Rule
		ai       string
		sitemaps []string
		want     string
	}{
		{[]Rule{{UserAgent: "*", Disallow: []string{"admin"}}}, "", nil, "start with"},
		{[]Rule{{UserAgent: "*\nUser-agent: evil", Disallow: []string{"/"}}}, "", nil, "newline"},
		{[]Rule{{UserAgent: "*", Disallow: []string{"/a\r\nSitemap: x"}}}, "", nil, "newline"},
		{rules, "block", nil, "aiCrawlers"},
		{rules, "", []string{"/sitemap.xml"}, "absolute"},
		{[]Rule{{UserAgent: "*"}}, "", nil, "at least one"},
	}
	for _, c := range checks {
		if _, err := RobotsTxt(c.rules, c.ai, c.sitemaps); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("want %q, got %v", c.want, err)
		}
	}
}

func TestLlmsTxt(t *testing.T) {
	got, err := LlmsTxt("Acme", "Acme builds rockets.", []Section{
		{Name: "Docs", Links: []Link{{Title: "Quickstart", URL: "https://acme.dev/start", Description: "Install and launch"}, {Title: "API [v2]", URL: "https://acme.dev/api"}}},
		{Name: "Optional", Links: []Link{{Title: "Blog", URL: "https://acme.dev/blog"}}},
	})
	want := "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n" +
		"- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n"
	if err != nil || got != want {
		t.Fatalf("got %q err %v", got, err)
	}
	if got, _ := LlmsTxt("Acme", "S", nil); got != "# Acme\n\n> S\n" {
		t.Fatalf("got %q", got)
	}
	bad := []func() error{
		func() error { _, err := LlmsTxt("", "S", nil); return err },
		func() error { _, err := LlmsTxt("A\nB", "S", nil); return err },
		func() error { _, err := LlmsTxt("A", "S\nT", nil); return err },
		func() error {
			_, err := LlmsTxt("A", "S", []Section{{Name: "D", Links: []Link{{Title: "x", URL: "/rel"}}}})
			return err
		},
		func() error {
			_, err := LlmsTxt("A", "S", []Section{{Name: "D", Links: []Link{{Title: "x", URL: "https://a.dev", Description: "a\nb"}}}})
			return err
		},
	}
	for i, fn := range bad {
		if fn() == nil {
			t.Fatalf("case %d accepted", i)
		}
	}
}
