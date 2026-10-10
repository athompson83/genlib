// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.sanitize;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class EditorHtmlSanitizerTest {
  // Shared XSS corpus used by every language in this cookbook topic.
  static final List<String> PAYLOADS = List.of(
      "<script>alert(1)</script><p>ok</p>",
      "<img src=x onerror=alert(1)>",
      "<a href=\"javascript:alert(1)\">x</a>",
      "<a href=\"JaVaScRiPt:alert(1)\">x</a>",
      "<a href=\"&#106;avascript:alert(1)\">x</a>",
      "<a href=\" javascript:alert(1)\">x</a>",
      "<a href=\"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==\">x</a>",
      "<a href=\"vbscript:msgbox(1)\">x</a>",
      "<p style=\"background:url(javascript:alert(1))\" onclick=\"steal()\">x</p>",
      "<svg onload=alert(1)><circle/></svg>",
      "<iframe src=\"https://evil.example\"></iframe>",
      "<style>p{color:red}</style><p>styled</p>",
      "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\">",
      "<form action=\"https://evil.example\"><input name=\"q\"></form>",
      "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>");

  static final List<Pattern> DANGEROUS = List.of(
      Pattern.compile("<\\s*(script|img|svg|iframe|style|object|embed|form|input|math)\\b", Pattern.CASE_INSENSITIVE),
      Pattern.compile("<[^>]*\\s(on[a-z]+|style)\\s*=", Pattern.CASE_INSENSITIVE),
      Pattern.compile("href\\s*=\\s*[\"']?\\s*(javascript|data|vbscript):", Pattern.CASE_INSENSITIVE));

  @Test
  void xssPayloads() {
    for (String payload : PAYLOADS) {
      String clean = EditorHtmlSanitizer.sanitize(payload);
      for (Pattern p : DANGEROUS) {
        assertFalse(p.matcher(clean).find(), payload + " -> " + clean);
      }
    }
  }

  @Test
  void formattingAndSafeLinksSurvive() {
    String clean = EditorHtmlSanitizer.sanitize(
        "<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>"
            + "<p><a href=\"https://example.com/a?b=1\" onclick=\"x()\" target=\"_blank\">link</a> "
            + "<a href=\"mailto:team@example.com\">mail</a></p>");
    // OWASP encodes '=' and '@' inside attribute values; browsers decode them.
    for (String want : List.of("<h2>Title</h2>", "<strong>world</strong>", "<em>!</em>", "<ul><li>one</li></ul>",
        "href=\"https://example.com/a?b&#61;1\"", "href=\"mailto:team&#64;example.com\"",
        "rel=\"noopener noreferrer nofollow\"")) {
      assertTrue(clean.contains(want), "missing " + want + " in " + clean);
    }
    assertFalse(clean.contains("onclick") || clean.contains("target="), clean);
  }
}
