// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: http(s) URL normalization (RFC 3986 section 6) for cache keys, dedupe and allow-list
// comparison. Original source; copy and adapt. Hand-parsed (no URL class) so every runtime agrees:
// lowercase scheme/host, default port removed, percent-encoding normalized, dot segments removed,
// empty path -> "/", fragment dropped. Userinfo is rejected. Errors are RangeError.

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const URL_SHAPE = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/;
const AUTHORITY = /^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]*))?$/;

/** RFC 3986 section 5.2.4 remove_dot_segments. */
export function removeDotSegments(path: string): string {
  let input = path, out = "";
  const pop = (): void => { const i = out.lastIndexOf("/"); out = i < 0 ? "" : out.slice(0, i); };
  while (input !== "") {
    if (input.startsWith("../")) input = input.slice(3);
    else if (input.startsWith("./")) input = input.slice(2);
    else if (input.startsWith("/./")) input = `/${input.slice(3)}`;
    else if (input === "/.") input = "/";
    else if (input.startsWith("/../")) { input = `/${input.slice(4)}`; pop(); }
    else if (input === "/..") { input = "/"; pop(); }
    else if (input === "." || input === "..") input = "";
    else {
      const i = input.indexOf("/", input.startsWith("/") ? 1 : 0);
      out += i < 0 ? input : input.slice(0, i);
      input = i < 0 ? "" : input.slice(i);
    }
  }
  return out;
}

function normalizePercent(s: string): string {
  if (/%(?![0-9A-Fa-f]{2})/.test(s)) throw new RangeError("'%' must be followed by two hex digits");
  return s.replace(/%([0-9A-Fa-f]{2})/g, (_m, hex: string) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return UNRESERVED.test(c) ? c : `%${hex.toUpperCase()}`;
  });
}

/** RFC 5952 text for a bracket-free IPv6 literal (embedded IPv4 and ::ffff: mapped forms included). */
export function canonicalIpv6(text: string): string {
  const bad = (): never => { throw new RangeError(`invalid IPv6 address: ${JSON.stringify(text)}`); };
  if (!/^[0-9A-Fa-f:.]+$/.test(text) || text.split("::").length > 2) bad();
  let head = text, tail: number[] = [];
  if (text.includes(".")) {
    const i = text.lastIndexOf(":");
    const parts = text.slice(i + 1).split(".");
    if (i < 0 || parts.length !== 4 || parts.some((p) => !/^(?:0|[1-9][0-9]{0,2})$/.test(p) || Number(p) > 255)) bad();
    tail = [Number(parts[0]) * 256 + Number(parts[1]), Number(parts[2]) * 256 + Number(parts[3])];
    head = text.slice(i - 1, i + 1) === "::" ? text.slice(0, i + 1) : text.slice(0, i);
  }
  const groups = (s: string): number[] => (s === "" ? [] : s.split(":").map((h) => (/^[0-9A-Fa-f]{1,4}$/.test(h) ? parseInt(h, 16) : bad())));
  const need = 8 - tail.length;
  let g: number[];
  if (head.includes("::")) {
    const [a = "", b = ""] = head.split("::");
    const ga = groups(a), gb = groups(b);
    if (ga.length + gb.length > need - 1) bad();
    g = [...ga, ...new Array<number>(need - ga.length - gb.length).fill(0), ...gb, ...tail];
  } else {
    g = [...groups(head), ...tail];
    if (g.length !== 8) bad();
  }
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const [hi = 0, lo = 0] = g.slice(6);
    return `::ffff:${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  let best = -1, bestLen = 1;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const h = g.map((x) => x.toString(16));
  return best < 0 ? h.join(":") : `${h.slice(0, best).join(":")}::${h.slice(best + bestLen).join(":")}`;
}

/** Normalized "scheme://host[:port]/path[?query]" for http and https URLs; throws RangeError otherwise. */
export function normalizeUrl(text: string): string {
  if (typeof text !== "string" || /[\x00-\x20\x7f]/.test(text)) throw new RangeError("URL must not contain spaces or control characters");
  const m = URL_SHAPE.exec(text);
  if (!m) throw new RangeError("URL must be scheme://authority/path");
  const scheme = (m[1] ?? "").toLowerCase();
  const auth = m[2] ?? "";
  if (scheme !== "http" && scheme !== "https") throw new RangeError("only http and https URLs are supported");
  if (auth.includes("@")) throw new RangeError("userinfo is not allowed");
  const a = AUTHORITY.exec(auth);
  if (!a) throw new RangeError("invalid host");
  let host = (a[1] ?? "").toLowerCase();
  if (host.startsWith("[")) host = `[${canonicalIpv6(host.slice(1, -1))}]`;
  let port = "";
  if (a[2] !== undefined && a[2] !== "") {
    const p = Number(a[2]);
    if (p > 65535) throw new RangeError("port out of range");
    if (!((scheme === "http" && p === 80) || (scheme === "https" && p === 443))) port = `:${p}`;
  }
  const path = removeDotSegments(normalizePercent(m[3] ?? "")) || "/";
  const query = m[4] && m[4] !== "?" ? normalizePercent(m[4]) : "";
  return `${scheme}://${host}${port}${path}${query}`;
}
