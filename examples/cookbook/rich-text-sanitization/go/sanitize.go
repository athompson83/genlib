// SPDX-License-Identifier: Apache-2.0

// Package sanitize is a Genlib cookbook wrapper: server-side allowlist sanitization of
// rich-text editor HTML with github.com/microcosm-cc/bluemonday (BSD-3-Clause).
package sanitize

import "github.com/microcosm-cc/bluemonday"

// policy is built once; a configured bluemonday policy is safe for concurrent use.
var policy = newPolicy()

func newPolicy() *bluemonday.Policy {
	p := bluemonday.NewPolicy() // empty allowlist: everything not allowed below is removed
	p.AllowElements("p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
		"ul", "ol", "li", "h1", "h2", "h3")
	p.AllowAttrs("href").OnElements("a") // no style, class, id or on* handlers anywhere
	p.AllowURLSchemes("http", "https", "mailto")
	p.RequireParseableURLs(true)
	p.AllowRelativeURLs(true)
	p.RequireNoFollowOnLinks(true)
	p.RequireNoReferrerOnLinks(true)
	return p
}

// EditorHTML returns HTML containing only allowlisted formatting and safe links.
// script/style/iframe/object contents are dropped with the element (bluemonday default).
func EditorHTML(dirty string) string {
	return policy.Sanitize(dirty)
}
