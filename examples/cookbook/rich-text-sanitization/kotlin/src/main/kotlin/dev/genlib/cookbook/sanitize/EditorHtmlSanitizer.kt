// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.sanitize

import org.owasp.html.HtmlPolicyBuilder
import org.owasp.html.PolicyFactory

/**
 * Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with the OWASP
 * Java HTML Sanitizer (Apache-2.0). A PolicyFactory is immutable and thread-safe.
 */
object EditorHtmlSanitizer {
    val policy: PolicyFactory = HtmlPolicyBuilder()
        .allowElements(
            "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
            "ul", "ol", "li", "h1", "h2", "h3", "a",
        )
        .allowUrlProtocols("http", "https", "mailto")
        .allowAttributes("href").onElements("a") // no style, class, id or on* handlers anywhere
        .requireRelsOnLinks("noopener", "noreferrer", "nofollow")
        .toFactory()

    /** Return HTML containing only allowlisted formatting and safe links. */
    fun sanitize(dirty: String): String = policy.sanitize(dirty)
}
