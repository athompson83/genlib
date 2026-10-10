// SPDX-License-Identifier: Apache-2.0
//! Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with
//! `ammonia` (MIT OR Apache-2.0, html5ever parser).

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use ammonia::Builder;

const ALLOWED_TAGS: [&str; 18] = [
    "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre", "ul", "ol", "li",
    "h1", "h2", "h3", "a",
];

// Built once; `Builder::clean` takes `&self` and is safe to share across threads.
static CLEANER: LazyLock<Builder<'static>> = LazyLock::new(|| {
    let mut b = Builder::empty(); // start from nothing, then allow
    b.tags(HashSet::from(ALLOWED_TAGS))
        .clean_content_tags(HashSet::from(["script", "style"]))
        .tag_attributes(HashMap::from([("a", HashSet::from(["href"]))]))
        .url_schemes(HashSet::from(["http", "https", "mailto"]))
        .link_rel(Some("noopener noreferrer nofollow"))
        .strip_comments(true);
    b
});

/// Return HTML containing only allowlisted formatting and safe links.
pub fn sanitize_editor_html(dirty: &str) -> String {
    CLEANER.clean(dirty).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use regex::Regex;

    // Shared XSS corpus used by every language in this cookbook topic.
    const PAYLOADS: [&str; 15] = [
        "<script>alert(1)</script><p>ok</p>",
        "<img src=x onerror=alert(1)>",
        r#"<a href="javascript:alert(1)">x</a>"#,
        r#"<a href="JaVaScRiPt:alert(1)">x</a>"#,
        r#"<a href="&#106;avascript:alert(1)">x</a>"#,
        r#"<a href=" javascript:alert(1)">x</a>"#,
        r#"<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>"#,
        r#"<a href="vbscript:msgbox(1)">x</a>"#,
        r#"<p style="background:url(javascript:alert(1))" onclick="steal()">x</p>"#,
        "<svg onload=alert(1)><circle/></svg>",
        r#"<iframe src="https://evil.example"></iframe>"#,
        "<style>p{color:red}</style><p>styled</p>",
        r#"<noscript><p title="</noscript><img src=x onerror=alert(1)>">"#,
        r#"<form action="https://evil.example"><input name="q"></form>"#,
        "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)></style></mglyph></table></mtext></math>",
    ];

    #[test]
    fn xss_payloads() {
        let dangerous = [
            Regex::new(r"(?i)<\s*(script|img|svg|iframe|style|object|embed|form|input|math)\b").unwrap(),
            Regex::new(r"(?i)<[^>]*\s(on[a-z]+|style)\s*=").unwrap(),
            Regex::new(r#"(?i)href\s*=\s*["']?\s*(javascript|data|vbscript):"#).unwrap(),
        ];
        for payload in PAYLOADS {
            let clean = sanitize_editor_html(payload);
            for re in &dangerous {
                assert!(!re.is_match(&clean), "{payload} -> {clean}");
            }
        }
    }

    #[test]
    fn formatting_and_safe_links_survive() {
        let clean = sanitize_editor_html(concat!(
            "<h2>Title</h2><p>Hello <strong>world</strong> <em>!</em></p><ul><li>one</li></ul>",
            r#"<p><a href="https://example.com/a?b=1" onclick="x()" target="_blank">link</a> "#,
            r#"<a href="mailto:team@example.com">mail</a></p>"#,
        ));
        for want in [
            "<h2>Title</h2>",
            "<strong>world</strong>",
            "<em>!</em>",
            "<ul><li>one</li></ul>",
            r#"href="https://example.com/a?b=1""#,
            r#"href="mailto:team@example.com""#,
            r#"rel="noopener noreferrer nofollow""#,
        ] {
            assert!(clean.contains(want), "missing {want} in {clean}");
        }
        assert!(!clean.contains("onclick") && !clean.contains("target="), "{clean}");
    }
}
