// SPDX-License-Identifier: Apache-2.0
import Foundation
import XCTest
@testable import RichTextSanitization

final class EditorHtmlSanitizerTests: XCTestCase {
    // Shared XSS corpus used by every language in this cookbook topic.
    let payloads = [
        "<script>alert(1)</script><p>ok</p>",
        "<img src=x onerror=alert(1)>",
        #"<a href="javascript:alert(1)">x</a>"#,
        #"<a href="JaVaScRiPt:alert(1)">x</a>"#,
        #"<a href="&#106;avascript:alert(1)">x</a>"#,
        #"<a href=" javascript:alert(1)">x</a>"#,
        #"<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>"#,
        #"<a href="vbscript:msgbox(1)">x</a>"#,
        #"<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>"#,
        "<svg onload=alert(1)><circle/></svg>",
        #"<iframe src="https://evil.example"></iframe>"#,
        "<style>p{color:red}</style><p>styled</p>",
        #"<noscript><p title="</noscript><img src=x onerror=alert(1)>">"#,
        #"<form action="https://evil.example"><input name="q"></form>"#,
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
    ]

    let dangerous = [
        #"<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b"#,
        #"<[^>]*\s(on[a-z]+|style)\s*="#,
        #"href\s*=\s*["']?\s*(javascript|data|vbscript):"#,
    ]

    func testXssPayloadsLoseExecutableParts() throws {
        for payload in payloads {
            let clean = try EditorHtmlSanitizer.sanitize(payload)
            for pattern in dangerous {
                XCTAssertNil(
                    clean.range(of: pattern, options: [.regularExpression, .caseInsensitive]),
                    "\(payload) -> \(clean)")
            }
        }
    }

    func testFormattingAndSafeLinksSurvive() throws {
        let clean = try EditorHtmlSanitizer.sanitize(
            "<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>"
                + #"<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> "#
                + #"<a href="mailto:team@example.com">mail</a></p>"#)
        for want in [
            "<h2>Title</h2>", "<strong>world</strong>", "<em>!</em>", "<ul><li>one</li></ul>",
            #"href="https://example.com/a?b=1""#, #"href="mailto:team@example.com""#,
            #"rel="noopener noreferrer nofollow""#,
        ] {
            XCTAssertTrue(clean.contains(want), "missing \(want) in \(clean)")
        }
        XCTAssertFalse(clean.contains("onclick") || clean.contains("target="), clean)
    }
}
