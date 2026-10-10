// SPDX-License-Identifier: Apache-2.0
package dev.genlib.cookbook.sanitize;

import org.owasp.html.HtmlPolicyBuilder;
import org.owasp.html.PolicyFactory;

/**
 * Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with the OWASP
 * Java HTML Sanitizer (Apache-2.0). A PolicyFactory is immutable and thread-safe.
 */
public final class EditorHtmlSanitizer {
  private EditorHtmlSanitizer() {}

  public static final PolicyFactory POLICY = new HtmlPolicyBuilder()
      .allowElements("p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
          "ul", "ol", "li", "h1", "h2", "h3", "a")
      .allowUrlProtocols("http", "https", "mailto")
      .allowAttributes("href").onElements("a") // no style, class, id or on* handlers anywhere
      .requireRelsOnLinks("noopener", "noreferrer", "nofollow")
      .toFactory();

  /** Return HTML containing only allowlisted formatting and safe links. */
  public static String sanitize(String dirty) {
    return POLICY.sanitize(dirty);
  }
}
