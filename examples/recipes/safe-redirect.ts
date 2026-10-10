// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: open-redirect guard for "?next=" / "returnTo" parameters. Original source; copy and adapt.
// Accepts same-site paths ("/x", never "//x") and absolute http(s) URLs whose origin exactly matches an
// allowed origin. Protocol-relative URLs, backslashes, userinfo ("@"), control characters, javascript:
// and relative paths all return the fallback. Redirect only to the returned value.

export const MAX_REDIRECT_LENGTH = 2048;
const ABSOLUTE = /^(https?):\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(\/[^?#]*)?(\?[^#]*)?(#[\s\S]*)?$/i;

/** "scheme://host[:port]" lowercased with the default port dropped, or null when not an allowed shape. */
export function redirectOrigin(url: string): string | null {
  const m = ABSOLUTE.exec(url);
  if (!m) return null;
  const scheme = (m[1] ?? "").toLowerCase();
  const host = (m[2] ?? "").toLowerCase();
  if (host === "" || host.startsWith(".") || host.endsWith(".") || host.includes("..")) return null;
  let port = "";
  if (m[3] !== undefined) {
    const p = Number(m[3]);
    if (p < 1 || p > 65535) return null;
    if (!((scheme === "https" && p === 443) || (scheme === "http" && p === 80))) port = `:${p}`;
  }
  return `${scheme}://${host}${port}`;
}

function unsafeChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/** Returns target when it is a same-site path or an allowed absolute URL, otherwise fallback. */
export function safeRedirect(target: string, allowedOrigins: readonly string[], fallback = "/"): string {
  if (typeof target !== "string" || target === "" || target.length > MAX_REDIRECT_LENGTH || unsafeChars(target)) return fallback;
  if (target.startsWith("/")) return target.startsWith("//") ? fallback : target;
  const origin = redirectOrigin(target);
  if (origin === null) return fallback;
  for (const allowed of allowedOrigins) if (typeof allowed === "string" && redirectOrigin(allowed) === origin) return target;
  return fallback;
}
