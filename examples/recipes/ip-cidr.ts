// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: IP parsing, CIDR matching and an SSRF guard. Original source; copy and adapt.
// Hand-parsed (no URL/net parsers) so every runtime agrees. SSRF use: resolve the hostname yourself,
// check EVERY resolved address with isPublicIp, connect to that checked address (no second DNS
// lookup) and re-check after every redirect. Parsers throw RangeError; validators return booleans.

const V4_PART = /^(?:0|[1-9][0-9]{0,2})$/;
const HEX_GROUP = /^[0-9A-Fa-f]{1,4}$/;

function parseV4(text: string): number[] {
  const parts = text.split(".");
  if (parts.length !== 4) throw new RangeError(`invalid IPv4 address: ${JSON.stringify(text)}`);
  return parts.map((p) => {
    if (!V4_PART.test(p) || Number(p) > 255) throw new RangeError(`invalid IPv4 address: ${JSON.stringify(text)}`);
    return Number(p);
  });
}

function groups(text: string, original: string): number[] {
  if (text === "") return [];
  return text.split(":").map((h) => {
    if (!HEX_GROUP.test(h)) throw new RangeError(`invalid IPv6 address: ${JSON.stringify(original)}`);
    return parseInt(h, 16);
  });
}

function parseV6(original: string): number[] {
  let text = original;
  const bad = (): never => { throw new RangeError(`invalid IPv6 address: ${JSON.stringify(original)}`); };
  if (text.split("::").length > 2 || !/^[0-9A-Fa-f:.]+$/.test(text)) bad();
  let tail: number[] = [];
  if (text.includes(".")) {
    const i = text.lastIndexOf(":");
    if (i < 0) bad();
    tail = parseV4(text.slice(i + 1));
    text = text.slice(i - 1, i + 1) === "::" ? text.slice(0, i + 1) : text.slice(0, i);
  }
  const need = tail.length ? 6 : 8;
  let g: number[];
  if (text.includes("::")) {
    const [a = "", b = ""] = text.split("::");
    const ga = groups(a, original), gb = groups(b, original);
    if (ga.length + gb.length > need - 1) bad();
    g = [...ga, ...new Array<number>(need - ga.length - gb.length).fill(0), ...gb];
  } else {
    g = groups(text, original);
    if (g.length !== need) bad();
  }
  return [...g.flatMap((x) => [x >> 8, x & 0xff]), ...tail];
}

/** 4 (IPv4) or 16 (IPv6) bytes. Rejects zone ids, brackets, whitespace and CIDR suffixes. */
export function parseIp(text: string): Uint8Array {
  if (typeof text !== "string") throw new RangeError("address must be a string");
  return Uint8Array.from(text.includes(":") ? parseV6(text) : parseV4(text));
}

const isMapped = (b: Uint8Array): boolean => b.length === 16 && b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
const isNat64 = (b: Uint8Array): boolean => b.length === 16 && [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0].every((x, i) => b[i] === x);

/** RFC 5952 text: lowercase, no leading zeros, longest zero run as "::", ::ffff:a.b.c.d for mapped. */
export function formatIp(b: Uint8Array): string {
  if (b.length === 4) return Array.from(b).join(".");
  if (isMapped(b)) return `::ffff:${Array.from(b.slice(12)).join(".")}`;
  const g: number[] = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[i] ?? 0) << 8) | (b[i + 1] ?? 0));
  let best = -1, bestLen = 1;
  for (let i = 0; i < 8;) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  const h = g.map((x) => x.toString(16));
  if (best < 0) return h.join(":");
  return `${h.slice(0, best).join(":")}::${h.slice(best + bestLen).join(":")}`;
}

export const canonicalIp = (text: string): string => formatIp(parseIp(text));

const toBig = (b: Uint8Array): bigint => b.reduce((n, x) => (n << 8n) | BigInt(x), 0n);

/** Parses "address/prefix"; throws when malformed or host bits are set. */
export function parseCidr(cidr: string): { address: Uint8Array; prefix: number } {
  const parts = typeof cidr === "string" ? cidr.split("/") : [];
  if (parts.length !== 2) throw new RangeError(`invalid CIDR: ${JSON.stringify(cidr)}`);
  const address = parseIp(parts[0] ?? "");
  const p = parts[1] ?? "";
  const bits = address.length * 8;
  if (!V4_PART.test(p) || Number(p) > bits) throw new RangeError(`invalid CIDR prefix: ${JSON.stringify(cidr)}`);
  const prefix = Number(p);
  if ((toBig(address) & ((1n << BigInt(bits - prefix)) - 1n)) !== 0n) throw new RangeError(`CIDR has host bits set: ${JSON.stringify(cidr)}`);
  return { address, prefix };
}

/** True when ip is inside cidr. Different families never match (::ffff:10.0.0.1 is not in 10.0.0.0/8). */
export function cidrContains(cidr: string, ip: string): boolean {
  const { address, prefix } = parseCidr(cidr);
  const x = parseIp(ip);
  if (x.length !== address.length) return false;
  const shift = BigInt(address.length * 8 - prefix);
  return toBig(x) >> shift === toBig(address) >> shift;
}

export const V4_SPECIAL = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
  "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24",
  "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"] as const;
export const V6_SPECIAL = ["::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7",
  "fe80::/10", "ff00::/8"] as const;

/** False for private, loopback, link-local, documentation, multicast, reserved and other special ranges. */
export function isPublicIp(ip: string): boolean {
  let b = parseIp(ip);
  if (isMapped(b) || isNat64(b)) b = b.slice(12);
  const text = formatIp(b);
  return !(b.length === 4 ? V4_SPECIAL : V6_SPECIAL).some((c) => cidrContains(c, text));
}
