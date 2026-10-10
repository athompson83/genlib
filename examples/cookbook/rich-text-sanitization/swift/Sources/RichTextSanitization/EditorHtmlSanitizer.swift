// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with
// SwiftSoup (MIT), a Swift port of jsoup's Cleaner. Its allowlist type is named `Whitelist`
// in SwiftSoup 2.x (jsoup calls the same concept `Safelist`).
import SwiftSoup

public enum EditorHtmlSanitizer {
    /// Build a fresh allowlist; SwiftSoup's Whitelist is a mutable class, so do not share one
    /// instance across threads while it could be modified.
    static func makeAllowlist() throws -> Whitelist {
        try Whitelist.none()
            .addTags("p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
                     "ul", "ol", "li", "h1", "h2", "h3", "a")
            .addAttributes("a", "href") // no style, class, id or on* handlers anywhere
            .addProtocols("a", "href", "http", "https", "mailto") // relative links are dropped
            .addEnforcedAttribute("a", "rel", "noopener noreferrer nofollow")
    }

    /// Return HTML containing only allowlisted formatting and safe links.
    public static func sanitize(_ dirty: String) throws -> String {
        let output = OutputSettings().prettyPrint(pretty: false)
        return try SwiftSoup.clean(dirty, "", makeAllowlist(), output) ?? ""
    }
}
