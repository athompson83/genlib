// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Markdown to plain text and word-safe excerpts. Original source; copy and adapt.
// A pragmatic regex stripper for previews, meta descriptions, notifications and search
// snippets. It is not a CommonMark parser and not an HTML sanitizer: escape the output
// before inserting it into HTML, and render full Markdown with a maintained parser.

export interface PlainTextOptions {
  /** Keep fenced/indented code content (default false: code blocks are dropped). */
  keepCode?: boolean;
  /** Keep line breaks between blocks (default false: collapse to one line). */
  keepLineBreaks?: boolean;
}

// Private-use placeholders protect backslash-escaped characters from the emphasis rules.
const OPEN = String.fromCharCode(0xe000);
const CLOSE = String.fromCharCode(0xe001);
const RESTORE = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");

export function markdownToPlainText(markdown: string, options: PlainTextOptions = {}): string {
  let text = markdown.replace(/\r\n?/g, "\n").replace(new RegExp(`[${OPEN}${CLOSE}]`, "g"), "");
  text = text.replace(/^---\n[\s\S]*?\n---\n/, ""); // YAML front matter
  text = text.replace(/^(```|~~~)[^\n]*\n([\s\S]*?)(?:^\1[ \t]*$|(?![\s\S]))/gm, (_m, _f, code: string) => (options.keepCode ? `${code}\n` : "\n"));
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_m, c: string) => `${OPEN}${c.charCodeAt(0)}${CLOSE}`);
  text = text
    .replace(/<\/?[A-Za-z][^>]*>/g, " ") // HTML tags
    .replace(/^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S+.*$/gm, "") // reference definitions
    .replace(/\[\^[^\]]+\]/g, "") // footnote markers
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt text
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // inline links -> text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // reference links -> text
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, "$1") // autolinks
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t]*#*[ \t]*$/gm, "$1") // ATX headings
    .replace(/^(.+)\n(?:=+|-+)[ \t]*$/gm, "$1") // setext headings
    .replace(/^[ \t]{0,3}(?:[-*_][ \t]*){3,}$/gm, "") // thematic breaks
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "") // blockquotes
    .replace(/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/gm, "") // list markers and task boxes
    .replace(/^[ \t]*\|?(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*:?-*:?[ \t]*$/gm, "") // table separator rows
    .replace(/[ \t]*\|[ \t]*/g, " ") // table pipes
    .replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1/g, (_m, _t, code: string) => code.trim()) // inline code
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1") // bold
    .replace(/(^|\W)__(?=\S)([\s\S]*?\S)__(?!\w)/g, "$1$2")
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, "$1") // italic
    .replace(/(^|\W)_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2") // snake_case_words stay intact
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1") // strikethrough
    .replace(RESTORE, (_m, code: string) => String.fromCharCode(Number(code))) // backslash escapes
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  if (options.keepLineBreaks) return text.split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.replace(/\s+/g, " ").trim();
}

/** Truncates at a word boundary to at most maxChars code points, appending an ellipsis when cut. */
export function excerpt(text: string, maxChars = 160, ellipsis = "..."): string {
  const chars = Array.from(text.trim());
  if (chars.length <= maxChars) return chars.join("");
  const room = Math.max(0, maxChars - Array.from(ellipsis).length);
  let cut = chars.slice(0, room).join("");
  const boundary = cut.search(/\s\S*$/);
  if (boundary > room * 0.6) cut = cut.slice(0, boundary);
  return cut.replace(/[\s,;:.!?-]+$/, "") + ellipsis;
}

export const markdownExcerpt = (markdown: string, maxChars = 160): string => excerpt(markdownToPlainText(markdown), maxChars);
