# Rich-text sanitization (editor HTML, server side)

Purpose: accept HTML from a browser rich-text editor (Tiptap, Lexical, Quill, a
`contenteditable`) and sanitize it **on the trusted server** with an allowlist before you
store or render it. Each example keeps basic formatting (`p br strong b em i u s
blockquote code pre ul ol li h1 h2 h3 a`), keeps `a href` only for `http`, `https` and
`mailto`, forces `rel="noopener noreferrer nofollow"` on links, and removes scripts,
event handlers, `style`, `javascript:`/`data:`/`vbscript:` URLs and every other element.
Code lives in
[`examples/cookbook/rich-text-sanitization/<language>/`](../../examples/cookbook/rich-text-sanitization/).

Every language runs the same 15-payload XSS corpus (script, `img onerror`, mixed-case
and entity-encoded `javascript:`, leading-space URL, `data:`/`vbscript:` links, `style`
and `onclick`, `svg onload`, `iframe`, `style` element, the `noscript` and
`math`/`mglyph` mutation-XSS shapes, `form`/`input`) and fails if the output still has a
dangerous element, an `on*`/`style` attribute inside a tag, or a dangerous URL scheme in
`href`. A second test checks that headings, lists, emphasis, an `https` link and a
`mailto` link survive with the forced `rel`. Versions and licenses were checked on the
registries on 2026-10-10.

| Language | Library (version) | License | Install | Code | Tested here |
| --- | --- | --- | --- | --- | --- |
| TypeScript (Node 22.18+) | `dompurify` 3.4.16 on `jsdom` 30.1.2 | Apache-2.0 OR MPL-2.0; MIT | `npm install dompurify@3.4.16 jsdom@30.1.2` | [typescript](../../examples/cookbook/rich-text-sanitization/typescript/) | yes (`npm test`, 2 tests; `tsc --noEmit --strict` incl. the Tiptap snippet) |
| Python 3.9+ | `nh3` 0.3.7 (bindings to Rust `ammonia`) | MIT | `pip install nh3==0.3.7` | [python](../../examples/cookbook/rich-text-sanitization/python/) | yes (`python -m unittest -v`, 2 tests, Python 3.13) |
| Go 1.24 | `github.com/microcosm-cc/bluemonday` v1.0.27 | BSD-3-Clause | `go get github.com/microcosm-cc/bluemonday@v1.0.27` | [go](../../examples/cookbook/rich-text-sanitization/go/) | yes (`go vet ./... && go test ./...`, go1.24.7) |
| Rust | `ammonia` 4.2.1 | MIT OR Apache-2.0 | `cargo add ammonia@=4.2.1` | [rust](../../examples/cookbook/rich-text-sanitization/rust/) | yes (`cargo test`, 2 tests, cargo 1.97) |
| Java 17+ | OWASP Java HTML Sanitizer 20260924.2 | Apache-2.0 | Maven `com.googlecode.owasp-java-html-sanitizer:owasp-java-html-sanitizer:20260924.2` | [java](../../examples/cookbook/rich-text-sanitization/java/) | yes (`mvn test`, 2 tests, JDK 21) |
| Kotlin (JVM) | OWASP Java HTML Sanitizer 20260924.2 | Apache-2.0 | same Maven coordinate | [kotlin](../../examples/cookbook/rich-text-sanitization/kotlin/) | yes (`mvn test`, Kotlin 2.2.20, 2 tests) |
| C# (.NET 8) | `HtmlSanitizer` (mganss) 9.2.1039 on AngleSharp 1.7.2 | MIT | `dotnet add package HtmlSanitizer --version 9.2.1039` | [csharp](../../examples/cookbook/rich-text-sanitization/csharp/) | yes (`dotnet test`, 16 test cases, SDK 8.0.425) |
| Dart 3.5+ | `sanitize_html` 2.2.0 (publisher google.dev) | Apache-2.0 | `dart pub add sanitize_html:2.2.0` | [dart](../../examples/cookbook/rich-text-sanitization/dart/) | yes (`dart test`, 2 tests, Dart 3.13.5) - fixed, broader allowlist, see notes |
| Swift 5.9+ (Linux and Apple) | `SwiftSoup` 2.14.1 (`Whitelist` + `Cleaner`) | MIT | SwiftPM `https://github.com/scinfu/SwiftSoup.git` exact `2.14.1` | [swift](../../examples/cookbook/rich-text-sanitization/swift/) | yes (`swift test`, 2 tests, Swift 6.2 on Linux) |

Alternatives: `sanitize-html` 2.18.0 (MIT, no DOM needed) for Node. `bleach` (Python)
is deprecated by its maintainers; migrate to `nh3`.

## Browser editor integration (Tiptap)

[`editor.browser.ts`](../../examples/cookbook/rich-text-sanitization/typescript/editor.browser.ts)
mounts Tiptap 3.31.4 (`@tiptap/core`, `@tiptap/starter-kit`, MIT) with headings 1-3 and
links limited to `http`, `https` and `mailto`, then POSTs `{ html: editor.getHTML(),
json: editor.getJSON() }` with a CSRF header. It was type-checked, not run in a browser.
The server treats both fields as untrusted: sanitize `html` with `sanitizeEditorHtml`, or
store `json` and render it server-side with `@tiptap/html` `generateHTML` before passing
the result through the same sanitizer. Lexical is equivalent: export with
`$generateHtmlFromNodes` (`@lexical/html`) or `editorState.toJSON()` and sanitize on the
server the same way.

## Security notes

- **Sanitize on the server, every time.** Editor configuration, client-side DOMPurify and
  disabled toolbar buttons are UX; anyone can POST raw HTML. Sanitize before storing (or
  at render time if old rows may predate the policy) and render the result without any
  further string concatenation.
- **Allowlist, never blocklist.** Start from an empty policy (`Builder::empty()`,
  `bluemonday.NewPolicy()`, `Whitelist.none()`) and add only what the editor emits.
- **Links.** Only `http`, `https`, `mailto`. Libraries parse and decode the URL before
  checking the scheme, which defeats `JaVaScRiPt:`, `&#106;avascript:` and leading
  whitespace; never check schemes with your own regex. Forced `rel` prevents
  reverse-tabnabbing and link-spam SEO; `target` is dropped (Dart keeps it).
- **No `style`, `class` or `id`.** Inline CSS enables UI redress and data exfiltration via
  `url()`; classes let content borrow your site's styles (fake buttons, hidden text); ids
  enable DOM clobbering. Add `class` back only with an explicit value allowlist.
- **Defence in depth.** Serve pages with a Content-Security-Policy that forbids inline
  script (`script-src 'self'` with nonces) and restricts `img-src`. Encode plain-text
  fields normally; the sanitizer is only for fields that are meant to contain HTML.
- **Do not post-process sanitized HTML** with string replacement or by re-parsing it with
  a different parser; that is how mutation XSS reappears. If you must transform, do it
  before sanitizing.
- **Keep the sanitizer current.** These libraries ship fixes for parser-differential and
  mutation-XSS bypasses; pin exact versions and update them deliberately.
- **What these libraries do not do:** they do not validate that a link's destination is
  safe (phishing), limit document size or nesting depth (cap request size first), or make
  stored HTML safe in non-HTML contexts (attribute values, JavaScript, Markdown, email
  clients with their own rules).

## Library-specific differences

- **TypeScript (DOMPurify):** needs a DOM; the example creates one jsdom window per process.
  `ALLOWED_URI_REGEXP` here accepts only absolute `http(s)`/`mailto`, so relative links are
  dropped. A hook sets `rel` on every anchor.
- **Python / Rust (ammonia):** `clean_content_tags` removes `script`/`style` with their
  content; relative URLs pass through (ammonia default). `link_rel` sets `rel`.
- **Go (bluemonday):** `RequireNoFollowOnLinks` + `RequireNoReferrerOnLinks` produce
  `rel="nofollow noreferrer"` (no `noopener`; it is redundant without `target`). The
  example allows relative URLs.
- **Java / Kotlin (OWASP):** output entity-encodes some characters inside attribute values
  (`=` becomes `&#61;`, `@` becomes `&#64;`); browsers decode them, but compare HTML
  semantically, not byte-for-byte. `PolicyFactory` is immutable and thread-safe.
- **C# (HtmlSanitizer):** pass empty `AllowedCssProperties`/`AllowedAtRules` so no CSS is
  ever kept; `PostProcessNode` sets `rel`. Configure once and reuse.
- **Dart (`sanitize_html`):** the allowlist is fixed (GitHub-style) and cannot be narrowed.
  It always removes scripts, event handlers, `style` and unsafe schemes, and the example
  turns off `id`/`class` and adds `rel`, but it also keeps `img` (http/https/relative
  `src`), tables, `div`/`span`, `target` and presentational attributes. The Dart test
  therefore allows `<img>` with a safe `src`. If remote images are unacceptable
  (tracking pixels), block them with CSP `img-src` or sanitize on a server written in
  another language from this table.
- **Swift (SwiftSoup):** `Whitelist` (jsoup's `Safelist`) is a mutable class; the example
  builds one per call. With no base URI, relative links are dropped. Use
  `OutputSettings().prettyPrint(pretty: false)` to avoid inserted newlines.
- Relative-URL behaviour is not covered by the shared tests; if your editor emits
  relative links, add a test for your chosen library.
