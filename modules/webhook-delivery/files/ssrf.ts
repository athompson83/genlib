// SPDX-License-Identifier: Apache-2.0
// SSRF guard for outgoing webhooks. A URL must be https (http only when the caller opts in for tests), carry no
// credentials, use a canonical host (decimal, octal, hex, shortened or percent-encoded IPv4 forms are refused because
// parsers disagree about them), and every address its hostname resolves to must be public unicast. The resolver is
// injected, so this file performs no network activity. Call guardWebhookUrl at registration and again at send time.

export type UrlRejection =
  | "invalid-url" | "https-required" | "credentials" | "blocked-host" | "non-canonical-ip" | "private-address" | "unresolvable";

export interface ParsedIp {
  readonly version: 4 | 6;
  /** 4 or 16 bytes in network order. */
  readonly bytes: Uint8Array;
}

export type UrlCheck =
  | { readonly ok: true; readonly url: string; readonly hostname: string; readonly ip: ParsedIp | null }
  | { readonly ok: false; readonly reason: UrlRejection };

export type GuardResult =
  | { readonly ok: true; readonly url: string; readonly hostname: string; readonly addresses: readonly string[] }
  | { readonly ok: false; readonly reason: UrlRejection };

/** Resolves a hostname to its IPv4 and IPv6 addresses (for example node:dns lookup with {all: true}). */
export type ResolveHost = (hostname: string, context: { readonly signal?: AbortSignal }) => Promise<readonly string[]>;

export interface UrlCheckOptions {
  /** Allow http: URLs (tests and local fixtures only). Address checks still apply. Default false. */
  readonly allowHttp?: boolean;
}

const MAX_URL_LENGTH = 2048;
const BLOCKED_NAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal", "metadata", "instance-data"]);

function parseIpv4(text: string): Uint8Array | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const part = parts[i] ?? "";
    // Canonical decimal only: no leading zeros (octal in some parsers), no hex, no empty labels.
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    out[i] = value;
  }
  return out;
}

function parseIpv6(text: string): Uint8Array | null {
  if (text.length < 2 || text.length > 45 || text.includes("%")) return null; // zone ids are refused
  let head = text;
  let tailV4: Uint8Array | null = null;
  const lastColon = text.lastIndexOf(":");
  if (text.slice(lastColon + 1).includes(".")) {
    tailV4 = parseIpv4(text.slice(lastColon + 1));
    if (!tailV4) return null;
    head = text.slice(0, lastColon + 1) + "0:0"; // placeholder groups, replaced below
  }
  const halves = head.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const values: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      values.push(Number.parseInt(group, 16));
    }
    return values;
  };
  const left = parseGroups(halves[0] ?? "");
  const right = halves.length === 2 ? parseGroups(halves[1] ?? "") : [];
  if (!left || !right) return null;
  let groups: number[];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...new Array<number>(missing).fill(0), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  groups.forEach((group, i) => { out[i * 2] = group >> 8; out[i * 2 + 1] = group & 0xff; });
  if (tailV4) out.set(tailV4, 12);
  return out;
}

/** Strictly parses a canonical dotted-decimal IPv4 or an IPv6 address (no brackets, no zone id). */
export function parseIp(text: string): ParsedIp | null {
  if (typeof text !== "string" || text.length === 0) return null;
  if (text.includes(":")) {
    const bytes = parseIpv6(text);
    return bytes ? { version: 6, bytes } : null;
  }
  const bytes = parseIpv4(text);
  return bytes ? { version: 4, bytes } : null;
}

function inV4(bytes: Uint8Array, a: number, b: number, c: number, d: number, prefix: number): boolean {
  const value = ((bytes[0] ?? 0) << 24 >>> 0) + ((bytes[1] ?? 0) << 16) + ((bytes[2] ?? 0) << 8) + (bytes[3] ?? 0);
  const base = ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~((1 << (32 - prefix)) - 1)) >>> 0;
  return ((value & mask) >>> 0) === ((base & mask) >>> 0);
}

const V4_BLOCKED: readonly [number, number, number, number, number][] = [
  [0, 0, 0, 0, 8], // "this network"
  [10, 0, 0, 0, 8], // private
  [100, 64, 0, 0, 10], // carrier-grade NAT
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local, including 169.254.169.254 cloud metadata
  [172, 16, 0, 0, 12], // private
  [192, 0, 0, 0, 24], // IETF protocol assignments (192.0.0.170/171 NAT64 discovery)
  [192, 0, 2, 0, 24], // documentation
  [192, 88, 99, 0, 24], // 6to4 relay anycast
  [192, 168, 0, 0, 16], // private
  [198, 18, 0, 0, 15], // benchmarking
  [198, 51, 100, 0, 24], // documentation
  [203, 0, 113, 0, 24], // documentation
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reserved and broadcast
];

function isPublicV4(bytes: Uint8Array): boolean {
  return !V4_BLOCKED.some(([a, b, c, d, prefix]) => inV4(bytes, a, b, c, d, prefix));
}

function startsWith(bytes: Uint8Array, prefix: readonly number[], bits: number): boolean {
  for (let bit = 0; bit < bits; bit++) {
    const byte = bit >> 3;
    const mask = 0x80 >> (bit & 7);
    if (((bytes[byte] ?? 0) & mask) !== ((prefix[byte] ?? 0) & mask)) return false;
  }
  return true;
}

function isPublicV6(bytes: Uint8Array): boolean {
  // Only global unicast 2000::/3 is eligible; this excludes ::, ::1, IPv4-mapped (::ffff:0:0/96) and IPv4-compatible
  // (::/96) forms, 64:ff9b::/96 NAT64, 100::/64 discard, fc00::/7 ULA, fe80::/10 link-local, fec0::/10 and ff00::/8.
  if (!startsWith(bytes, [0x20], 3)) return false;
  if (startsWith(bytes, [0x20, 0x01, 0x00], 23)) return false; // 2001::/23 IETF protocol assignments, incl. Teredo
  if (startsWith(bytes, [0x20, 0x01, 0x0d, 0xb8], 32)) return false; // documentation
  if (startsWith(bytes, [0x3f, 0xff], 20)) return false; // 3fff::/20 documentation
  if (startsWith(bytes, [0x20, 0x02], 16)) return false; // 6to4 embeds an arbitrary IPv4 address
  return true;
}

/** True only for public unicast addresses. Unparseable text is not public. */
export function isPublicIp(text: string): boolean {
  const ip = parseIp(text);
  if (!ip) return false;
  return ip.version === 4 ? isPublicV4(ip.bytes) : isPublicV6(ip.bytes);
}

/** Host exactly as written in the URL string (between `//` and the first `/ \ ? #`), without userinfo and port. */
function rawHostOf(input: string): string | null {
  const start = input.indexOf("//");
  if (start < 0) return null;
  let authority = input.slice(start + 2);
  const end = authority.search(/[/\\?#]/);
  if (end >= 0) authority = authority.slice(0, end);
  const at = authority.lastIndexOf("@");
  if (at >= 0) authority = authority.slice(at + 1);
  if (authority.startsWith("[")) {
    const close = authority.indexOf("]");
    return close < 0 ? null : authority.slice(0, close + 1);
  }
  const colon = authority.indexOf(":");
  return colon >= 0 ? authority.slice(0, colon) : authority;
}

/** Synchronous URL syntax check: scheme, credentials, blocked names, canonical IP literals and their ranges. */
export function checkWebhookUrl(input: string, options: UrlCheckOptions = {}): UrlCheck {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_LENGTH) return { ok: false, reason: "invalid-url" };
  // The WHATWG parser silently strips tabs and newlines and trims spaces; refuse them instead.
  if (/[\u0000- \u007f]/.test(input)) return { ok: false, reason: "invalid-url" };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (!(url.protocol === "https:" || (options.allowHttp === true && url.protocol === "http:"))) return { ok: false, reason: "https-required" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials" };
  const raw = rawHostOf(input);
  if (raw === null || raw === "") return { ok: false, reason: "invalid-url" };
  const hostname = url.hostname.toLowerCase();
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (raw.includes("%")) return { ok: false, reason: "non-canonical-ip" };

  if (name.startsWith("[")) {
    const ip = parseIp(name.slice(1, -1));
    if (!ip) return { ok: false, reason: "invalid-url" };
    if (!isPublicV6(ip.bytes)) return { ok: false, reason: "private-address" };
    return { ok: true, url: url.href, hostname: name.slice(1, -1), ip };
  }
  // The WHATWG parser turns any host whose last label is numeric (decimal, 0x hex, or octal) into an IPv4 address.
  const labels = name.split(".");
  const last = labels[labels.length - 1] ?? "";
  if (/^(0x[0-9a-f]*|\d+)$/i.test(last)) {
    const rawName = raw.toLowerCase().replace(/\.$/, "");
    const ip = parseIp(name);
    if (!ip || rawName !== name) return { ok: false, reason: "non-canonical-ip" };
    if (!isPublicV4(ip.bytes)) return { ok: false, reason: "private-address" };
    return { ok: true, url: url.href, hostname: name, ip };
  }
  if (BLOCKED_NAMES.has(name) || name.endsWith(".localhost") || name.endsWith(".internal") || name.endsWith(".local")) {
    return { ok: false, reason: "blocked-host" };
  }
  return { ok: true, url: url.href, hostname: name, ip: null };
}

export interface GuardOptions extends UrlCheckOptions {
  readonly resolveHost: ResolveHost;
  readonly signal?: AbortSignal;
}

/**
 * Full check: syntax, then every resolved address must be public. Returns the addresses so a pinning fetch can
 * connect to exactly what was checked (see CONTRACT.md on DNS rebinding).
 */
export async function guardWebhookUrl(input: string, options: GuardOptions): Promise<GuardResult> {
  const checked = checkWebhookUrl(input, options);
  if (!checked.ok) return checked;
  if (checked.ip) {
    return { ok: true, url: checked.url, hostname: checked.hostname, addresses: [checked.hostname] };
  }
  let addresses: readonly string[];
  try {
    addresses = await options.resolveHost(checked.hostname, options.signal ? { signal: options.signal } : {});
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ok: false, reason: "unresolvable" };
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return { ok: false, reason: "unresolvable" };
  for (const address of addresses) {
    if (typeof address !== "string" || !isPublicIp(address)) return { ok: false, reason: "private-address" };
  }
  return { ok: true, url: checked.url, hostname: checked.hostname, addresses: [...addresses] };
}
