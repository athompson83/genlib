// SPDX-License-Identifier: Apache-2.0

package sanitize

import (
	"regexp"
	"strings"
	"testing"
)

// Shared XSS corpus used by every language in this cookbook topic.
var payloads = []string{
	"<script>alert(1)</script><p>ok</p>",
	"<img src=x onerror=alert(1)>",
	`<a href="javascript:alert(1)">x</a>`,
	`<a href="JaVaScRiPt:alert(1)">x</a>`,
	`<a href="&#106;avascript:alert(1)">x</a>`,
	`<a href=" javascript:alert(1)">x</a>`,
	`<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>`,
	`<a href="vbscript:msgbox(1)">x</a>`,
	`<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>`,
	"<svg onload=alert(1)><circle/></svg>",
	`<iframe src="https://evil.example"></iframe>`,
	"<style>p{color:red}</style><p>styled</p>",
	`<noscript><p title="</noscript><img src=x onerror=alert(1)>">`,
	`<form action="https://evil.example"><input name="q"></form>`,
	"<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
}

var dangerous = []*regexp.Regexp{
	regexp.MustCompile(`(?i)<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b`),
	regexp.MustCompile(`(?i)<[^>]*\s(on[a-z]+|style)\s*=`),
	regexp.MustCompile(`(?i)href\s*=\s*["']?\s*(javascript|data|vbscript):`),
}

func TestXSSPayloads(t *testing.T) {
	for _, payload := range payloads {
		clean := EditorHTML(payload)
		for _, re := range dangerous {
			if re.MatchString(clean) {
				t.Errorf("%s -> %s (matched %s)", payload, clean, re)
			}
		}
	}
}

func TestFormattingAndSafeLinksSurvive(t *testing.T) {
	clean := EditorHTML(`<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>` +
		`<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> ` +
		`<a href="mailto:team@example.com">mail</a></p>`)
	for _, want := range []string{
		"<h2>Title</h2>", "<strong>world</strong>", "<em>!</em>", "<ul><li>one</li></ul>",
		`href="https://example.com/a?b=1"`, `href="mailto:team@example.com"`, "nofollow", "noreferrer",
	} {
		if !strings.Contains(clean, want) {
			t.Errorf("missing %q in %s", want, clean)
		}
	}
	if strings.Contains(clean, "onclick") || strings.Contains(clean, "target=") {
		t.Errorf("unsafe attribute kept: %s", clean)
	}
}
