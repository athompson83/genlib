// SPDX-License-Identifier: Apache-2.0
// Genlib cookbook: Tiptap (MIT) browser editor that emits HTML + JSON for the server.
// The browser output is untrusted input: the server must sanitize it (see sanitize.ts)
// before storing or rendering. Client-side settings below reduce noise, not risk.
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

export function mountEditor(element: HTMLElement, initialHtml = ""): Editor {
  return new Editor({
    element,
    content: initialHtml,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
        },
      }),
    ],
  });
}

/** Send both forms; the server sanitizes `html` (or re-renders `json` and sanitizes that). */
export async function saveDocument(editor: Editor, url: string, csrfToken: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ html: editor.getHTML(), json: editor.getJSON() }),
  });
  if (!response.ok) {
    throw new Error(`save failed: ${response.status}`);
  }
}

// Server side (Node), for reference:
//   import { sanitizeEditorHtml } from "./sanitize.ts";
//   const safeHtml = sanitizeEditorHtml(String(body.html ?? ""));
//   // store safeHtml; render it with a strict Content-Security-Policy.
// If you store `json` instead, render it with @tiptap/html `generateHTML(json, [StarterKit])`
// on the server and pass the result through sanitizeEditorHtml before display.
