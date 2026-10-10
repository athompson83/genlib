// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: server-side allowlist sanitization of rich-text editor HTML with
// DOMPurify (Apache-2.0 OR MPL-2.0) on a jsdom window (MIT). Run on the trusted server;
// never rely on the browser editor's own output being safe.
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const { window } = new JSDOM("");
const purify = createDOMPurify(window);

/** Basic formatting the editor may emit. Everything else (and its attributes) is dropped. */
export const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "blockquote", "code", "pre",
  "ul", "ol", "li", "h1", "h2", "h3", "a",
];
const SAFE_URL = /^(?:https?:|mailto:)/i; // absolute http(s) and mailto only

// Force safe link relations on every surviving anchor.
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "A") {
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

export function sanitizeEditorHtml(dirty: string): string {
  return purify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href"], // no style, class, id, on* handlers or data-* attributes
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_URL,
    KEEP_CONTENT: true, // unwrap unknown wrappers but keep their text
  });
}
