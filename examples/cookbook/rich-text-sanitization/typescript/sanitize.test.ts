// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeEditorHtml } from "./sanitize.ts";

// Shared XSS corpus used by every language in this cookbook topic.
const PAYLOADS = [
  "<script>alert(1)</script><p>ok</p>",
  "<img src=x onerror=alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>',
  "<svg onload=alert(1)><circle/></svg>",
  '<iframe src="https://evil.example"></iframe>',
  "<style>p{color:red}</style><p>styled</p>",
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<form action="https://evil.example"><input name="q"></form>',
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
];

const DANGEROUS = [
  /<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b/i,
  /<[^>]*\s(on[a-z]+|style)\s*=/i,
  /href\s*=\s*["']?\s*(javascript|data|vbscript):/i,
];

test("XSS payloads lose every executable part", () => {
  for (const payload of PAYLOADS) {
    const clean = sanitizeEditorHtml(payload);
    for (const pattern of DANGEROUS) {
      assert.doesNotMatch(clean, pattern, `${payload} -> ${clean}`);
    }
  }
});

test("basic formatting and safe links survive", () => {
  const clean = sanitizeEditorHtml(
    '<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>' +
      '<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> ' +
      '<a href="mailto:team@example.com">mail</a></p>',
  );
  assert.match(clean, /<h2>Title<\/h2>/);
  assert.match(clean, /<strong>world<\/strong>/);
  assert.match(clean, /<em>!<\/em>/);
  assert.match(clean, /<ul><li>one<\/li><\/ul>/);
  assert.match(clean, /href="https:\/\/example\.com\/a\?b=1"/);
  assert.match(clean, /href="mailto:team@example\.com"/);
  assert.match(clean, /rel="noopener noreferrer nofollow"/);
  assert.doesNotMatch(clean, /onclick|target=/);
});
