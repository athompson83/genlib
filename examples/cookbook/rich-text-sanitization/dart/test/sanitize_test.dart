// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_rich_text_sanitization/sanitize.dart';
import 'package:test/test.dart';

// Shared XSS corpus used by every language in this cookbook topic.
const payloads = [
  '<script>alert(1)</script><p>ok</p>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>',
  '<svg onload=alert(1)><circle/></svg>',
  '<iframe src="https://evil.example"></iframe>',
  '<style>p{color:red}</style><p>styled</p>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
  '<form action="https://evil.example"><input name="q"></form>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>',
];

// `img` is intentionally absent: sanitize_html's fixed allowlist keeps images with safe src.
final dangerous = [
  RegExp(r'<\s*(script|svg|iframe|style|object|embed|form|input|math)\b', caseSensitive: false),
  RegExp(r'<[^>]*\s(on[a-z]+|style)\s*=', caseSensitive: false),
  RegExp(r'''(href|src)\s*=\s*["']?\s*(javascript|data|vbscript):''', caseSensitive: false),
];

void main() {
  test('XSS payloads lose every executable part', () {
    for (final payload in payloads) {
      final clean = sanitizeEditorHtml(payload);
      for (final re in dangerous) {
        expect(re.hasMatch(clean), isFalse, reason: '$payload -> $clean');
      }
    }
  });

  test('basic formatting and safe links survive', () {
    final clean = sanitizeEditorHtml(
      '<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>'
      '<p><a href="https://example.com/a?b=1" onclick="x()" id="login" class="btn">link</a> '
      '<a href="mailto:team@example.com">mail</a></p>',
    );
    for (final want in [
      '<h2>Title</h2>',
      '<strong>world</strong>',
      '<em>!</em>',
      '<ul><li>one</li></ul>',
      'href="https://example.com/a?b=1"',
      'href="mailto:team@example.com"',
      'rel="noopener noreferrer nofollow"',
    ]) {
      expect(clean, contains(want));
    }
    expect(clean, isNot(contains('onclick')));
    expect(clean, isNot(contains('id=')));
    expect(clean, isNot(contains('class=')));
  });
}
