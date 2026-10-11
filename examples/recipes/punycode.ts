// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Punycode (RFC 3492) and simple IDNA-style domain conversion. Original source; copy and adapt.
// Bootstring with base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter "-";
// arithmetic is checked against 2^31 - 1. Strings are processed by code point. Decoding accepts either case and
// throws PunycodeError (a RangeError) for invalid digits, overflow, non-basic code points before the delimiter,
// truncated input and surrogate or > U+10FFFF results. The domain helpers lowercase ASCII only: they do NOT apply
// Unicode normalization or the IDNA/UTS #46 mapping table (normalize with .normalize("NFC") first if needed).
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart punycode modules.

export class PunycodeError extends RangeError { override name = "PunycodeError"; }

const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700, INITIAL_BIAS = 72, INITIAL_N = 128;
const MAXINT = 2 ** 31 - 1;

function adapt(delta: number, num: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  delta += Math.floor(delta / num);
  let k = 0;
  while (delta > Math.floor(((BASE - TMIN) * TMAX) / 2)) { delta = Math.floor(delta / (BASE - TMIN)); k += BASE; }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW));
}
const digit = (d: number): string => String.fromCharCode(d + 22 + (d < 26 ? 75 : 0));
const threshold = (k: number, bias: number): number => (k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias);
function value(cp: number): number {
  if (cp >= 48 && cp <= 57) return cp - 22;
  if (cp >= 65 && cp <= 90) return cp - 65;
  if (cp >= 97 && cp <= 122) return cp - 97;
  throw new PunycodeError("invalid digit");
}
const codePoints = (s: string): number[] => Array.from(s, (c) => c.codePointAt(0) ?? 0);

/** Encodes a Unicode string with Punycode (no "xn--" prefix). */
export function punycodeEncode(input: string): string {
  const cps = codePoints(input);
  const out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c));
  const b = out.length;
  let h = b, n = INITIAL_N, delta = 0, bias = INITIAL_BIAS;
  if (b) out.push("-");
  while (h < cps.length) {
    const m = cps.reduce((acc, c) => (c >= n && c < acc ? c : acc), Infinity);
    if ((m - n) * (h + 1) > MAXINT - delta) throw new PunycodeError("overflow");
    delta += (m - n) * (h + 1);
    n = m;
    for (const c of cps) {
      if (c < n && ++delta > MAXINT) throw new PunycodeError("overflow");
      if (c !== n) continue;
      let q = delta;
      for (let k = BASE; ; k += BASE) {
        const t = threshold(k, bias);
        if (q < t) break;
        out.push(digit(t + ((q - t) % (BASE - t))));
        q = Math.floor((q - t) / (BASE - t));
      }
      out.push(digit(q));
      bias = adapt(delta, h + 1, h === b);
      delta = 0;
      h++;
    }
    delta++;
    n++;
  }
  return out.join("");
}

/** Decodes a Punycode string (no "xn--" prefix); throws PunycodeError for invalid input. */
export function punycodeDecode(input: string): string {
  const s = codePoints(input);
  const i = s.lastIndexOf(45);
  const out: number[] = [];
  for (let j = 0; j < i; j++) {
    const c = s[j] ?? 0;
    if (c >= 0x80) throw new PunycodeError("non-basic code point");
    out.push(c);
  }
  let pos = i >= 0 ? i + 1 : 0, n = INITIAL_N, idx = 0, bias = INITIAL_BIAS;
  while (pos < s.length) {
    const old = idx;
    let w = 1;
    for (let k = BASE; ; k += BASE) {
      if (pos >= s.length) throw new PunycodeError("truncated input");
      const d = value(s[pos++] ?? 0);
      if (d > Math.floor((MAXINT - idx) / w)) throw new PunycodeError("overflow");
      idx += d * w;
      const t = threshold(k, bias);
      if (d < t) break;
      if (w > Math.floor(MAXINT / (BASE - t))) throw new PunycodeError("overflow");
      w *= BASE - t;
    }
    const len = out.length + 1;
    bias = adapt(idx - old, len, old === 0);
    if (Math.floor(idx / len) > MAXINT - n) throw new PunycodeError("overflow");
    n += Math.floor(idx / len);
    idx %= len;
    if (n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new PunycodeError("invalid code point");
    out.splice(idx++, 0, n);
  }
  return String.fromCodePoint(...out);
}

/** Lowercases ASCII and turns non-ASCII labels into "xn--" Punycode (no normalization or IDNA mapping). */
export function domainToAscii(domain: string): string {
  const trailing = domain.endsWith(".") && domain.length > 1;
  const labels = (trailing ? domain.slice(0, -1) : domain).split(".");
  const res = labels.map((label) => {
    if (label === "") throw new PunycodeError("empty label");
    let a = label.replace(/[A-Z]/g, (c) => c.toLowerCase());
    if (/[^\x00-\x7f]/.test(a)) a = "xn--" + punycodeEncode(a);
    if (a.length > 63) throw new PunycodeError("label too long");
    return a;
  });
  const out = res.join(".");
  if (out.length > 253) throw new PunycodeError("name too long");
  return out + (trailing ? "." : "");
}

/** Decodes every "xn--" label (case-insensitive prefix); other labels are kept (no IDNA mapping). */
export function domainToUnicode(domain: string): string {
  return domain.split(".").map((l) => (l.slice(0, 4).toLowerCase() === "xn--" ? punycodeDecode(l.slice(4)) : l)).join(".");
}
