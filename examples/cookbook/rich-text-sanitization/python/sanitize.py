# SPDX-License-Identifier: Apache-2.0
"""Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with nh3 (MIT).

nh3 binds the Rust ``ammonia`` sanitizer (html5ever parser). ``bleach`` is deprecated;
do not start new code on it.
"""
import nh3

ALLOWED_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
    "ul", "ol", "li", "h1", "h2", "h3", "a",
}

_CLEANER = nh3.Cleaner(
    tags=ALLOWED_TAGS,
    clean_content_tags={"script", "style"},  # drop these elements together with their content
    attributes={"a": {"href"}},  # no style, class, id or on* handlers anywhere
    url_schemes={"http", "https", "mailto"},  # relative URLs pass through (ammonia default)
    link_rel="noopener noreferrer nofollow",
    strip_comments=True,
)


def sanitize_editor_html(dirty: str) -> str:
    """Return HTML containing only allowlisted formatting and safe links."""
    return _CLEANER.clean(dirty)
