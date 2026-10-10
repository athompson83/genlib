// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.sanitize

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class EditorHtmlSanitizerTest {
    // Shared XSS corpus used by every language in this cookbook topic.
    private val payloads = listOf(
        "<script>alert(1)</script><p>ok</p>",
        "<img src=x onerror=alert(1)>",
        """<a href="javascript:alert(1)">x</a>""",
        """<a href="JaVaScRiPt:alert(1)">x</a>""",
        """<a href="&#106;avascript:alert(1)">x</a>""",
        """<a href=" javascript:alert(1)">x</a>""",
        """<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>""",
        """<a href="vbscript:msgbox(1)">x</a>""",
        """<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>""",
        "<svg onload=alert(1)><circle/></svg>",
        """<iframe src="https://evil.example"></iframe>""",
        "<style>p{color:red}</style><p>styled</p>",
        """<noscript><p title="</noscript><img src=x onerror=alert(1)>">""",
        """<form action="https://evil.example"><input name="q"></form>""",
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
    )

    private val dangerous = listOf(
        Regex("""<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b""", RegexOption.IGNORE_CASE),
        Regex("""<[^>]*\s(on[a-z]+|style)\s*=""", RegexOption.IGNORE_CASE),
        Regex("""href\s*=\s*["']?\s*(javascript|data|vbscript):""", RegexOption.IGNORE_CASE),
    )

    @Test
    fun xssPayloads() {
        for (payload in payloads) {
            val clean = EditorHtmlSanitizer.sanitize(payload)
            for (re in dangerous) assertFalse(re.containsMatchIn(clean), "$payload -> $clean")
        }
    }

    @Test
    fun formattingAndSafeLinksSurvive() {
        val clean = EditorHtmlSanitizer.sanitize(
            "<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>" +
                """<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> """ +
                """<a href="mailto:team@example.com">mail</a></p>""",
        )
        listOf(
            "<h2>Title</h2>", "<strong>world</strong>", "<em>!</em>", "<ul><li>one</li></ul>",
            // OWASP encodes '=' and '@' inside attribute values; browsers decode them.
            """href="https://example.com/a?b&#61;1"""", """href="mailto:team&#64;example.com"""",
            """rel="noopener noreferrer nofollow"""",
        ).forEach { assertTrue(it in clean, "missing $it in $clean") }
        assertFalse("onclick" in clean || "target=" in clean, clean)
    }
}
