// SPDX-License-Identifier: Apache-2.0
/// Genlib cookbook: server-side sanitization of rich-text editor HTML with
/// `sanitize_html` (Apache-2.0, published by google.dev, built on package:html).
///
/// The package uses a fixed GitHub-style allowlist that is broader than the other
/// languages in this cookbook: it also keeps `img` (http/https/relative `src`), tables,
/// `div`/`span`, `target` and other presentational attributes. It always strips scripts,
/// event handlers, `style` and unsafe URL schemes (`href`: http, https, mailto, relative).
/// The tag list cannot be narrowed; block remote images with a CSP `img-src` policy.
library;

import 'package:sanitize_html/sanitize_html.dart' as lib;

const _linkRel = ['noopener', 'noreferrer', 'nofollow'];

/// Return HTML without scripts, event handlers, styles or unsafe link schemes.
String sanitizeEditorHtml(String dirty) => lib.sanitizeHtml(
      dirty,
      allowElementId: (_) => false, // drop ids (DOM clobbering)
      allowClassName: (_) => false, // drop classes (UI spoofing with site CSS)
      addLinkRel: (_) => _linkRel,
    );
