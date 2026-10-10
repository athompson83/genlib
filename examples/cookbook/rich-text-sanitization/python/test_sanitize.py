# SPDX-License-Identifier: Apache-2.0
"""XSS corpus shared by every language in this cookbook topic. Run: python -m unittest -v"""
import re
import unittest

from sanitize import sanitize_editor_html

PAYLOADS = [
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
]

DANGEROUS = [
    re.compile(r"<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b", re.I),
    re.compile(r"<[^>]*\s(on[a-z]+|style)\s*=", re.I),
    re.compile(r"href\s*=\s*[\"']?\s*(javascript|data|vbscript):", re.I),
]


class SanitizeTest(unittest.TestCase):
    def test_xss_payloads(self) -> None:
        for payload in PAYLOADS:
            clean = sanitize_editor_html(payload)
            for pattern in DANGEROUS:
                self.assertIsNone(pattern.search(clean), f"{payload} -> {clean}")

    def test_formatting_and_safe_links_survive(self) -> None:
        clean = sanitize_editor_html(
            "<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>"
            '<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> '
            '<a href="mailto:team@example.com">mail</a></p>'
        )
        self.assertIn("<h2>Title</h2>", clean)
        self.assertIn("<strong>world</strong>", clean)
        self.assertIn("<em>!</em>", clean)
        self.assertIn("<ul><li>one</li></ul>", clean)
        self.assertIn('href="https://example.com/a?b=1"', clean)
        self.assertIn('href="mailto:team@example.com"', clean)
        self.assertIn('rel="noopener noreferrer nofollow"', clean)
        self.assertNotIn("onclick", clean)
        self.assertNotIn("target=", clean)


if __name__ == "__main__":
    unittest.main()
