// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: human-readable units: byte sizes (SI kB/MB and IEC KiB/MiB), byte-size parsing,
// durations ("1h 2m") and relative times ("in 3 hours", "2 days ago"). Original source; copy and adapt.
// Rounding is round-half-up in integer (BigInt) arithmetic so results never depend on float formatting
// and sizes up to 2^63-1 are exact. Invalid input throws RangeError. Not localized: use Intl for UI copy.

export type ByteBase = "si" | "iec";
const SI = ["B", "kB", "MB", "GB", "TB", "PB", "EB"];
const IEC = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];
const MAX = 2n ** 63n - 1n;
const PARSE = /^[ \t\n\r\f\v]*([0-9]+)(?:\.([0-9]+))?[ \t\n\r\f\v]*([A-Za-z]*)[ \t\n\r\f\v]*$/;
const UNITS: Record<string, bigint> = {
  "": 1n, b: 1n, kb: 1000n, mb: 1000n ** 2n, gb: 1000n ** 3n, tb: 1000n ** 4n, pb: 1000n ** 5n, eb: 1000n ** 6n,
  kib: 1024n, mib: 1024n ** 2n, gib: 1024n ** 3n, tib: 1024n ** 4n, pib: 1024n ** 5n, eib: 1024n ** 6n,
};
const roundDiv = (n: bigint, d: bigint): bigint => (2n * n + d) / (2n * d);
const roundDivNum = (n: number, d: number): number => Number(roundDiv(BigInt(n), BigInt(d)));

/** formatBytes(1536, "iec") === "1.5 KiB"; n is a non-negative safe integer or bigint; decimals 0..3. */
export function formatBytes(n: number | bigint, base: ByteBase = "si", decimals = 1): string {
  if (typeof n === "number" && !Number.isSafeInteger(n)) throw new RangeError("n must be a safe integer or bigint");
  const v0 = BigInt(n);
  if (v0 < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 3) throw new RangeError("n must be >= 0 and decimals 0..3");
  if (base !== "si" && base !== "iec") throw new RangeError("base must be 'si' or 'iec'");
  const units = base === "si" ? SI : IEC, step = base === "si" ? 1000n : 1024n;
  if (v0 < step) return `${v0} B`;
  let i = 1;
  while (i < 6 && v0 >= step ** BigInt(i + 1)) i++;
  const scale = 10n ** BigInt(decimals);
  let v = roundDiv(v0 * scale, step ** BigInt(i));
  if (v >= step * scale && i < 6) { i++; v = roundDiv(v0 * scale, step ** BigInt(i)); }
  let text = String(v / scale);
  if (decimals > 0) text += `.${String(v % scale).padStart(decimals, "0")}`.replace(/0+$/, "").replace(/\.$/, "");
  return `${text} ${units[i] ?? ""}`;
}

/** "1.5 GiB" -> 1610612736n; units case-insensitive (kB = 1000, KiB = 1024); throws above 2^63-1. */
export function parseBytes(text: string): bigint {
  const m = typeof text === "string" ? PARSE.exec(text) : null;
  const mult = m ? UNITS[(m[3] ?? "").toLowerCase()] : undefined;
  if (!m || mult === undefined || !Object.hasOwn(UNITS, (m[3] ?? "").toLowerCase())) throw new RangeError(`invalid byte size: ${JSON.stringify(text)}`);
  const frac = m[2] ?? "";
  const result = roundDiv(BigInt((m[1] ?? "") + frac) * mult, 10n ** BigInt(frac.length));
  if (result > MAX) throw new RangeError("byte size exceeds 2^63-1");
  return result;
}

/** Two largest non-zero units of d, h, m, s ("1h 2m", "1d 1h"); below one second "<ms>ms". */
export function formatDuration(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new RangeError("ms must be a non-negative integer");
  if (ms < 1000) return `${ms}ms`;
  let s = Math.floor(ms / 1000);
  const parts: string[] = [];
  for (const [name, size] of [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]] as const) {
    const q = Math.floor(s / size);
    s -= q * size;
    if (q) parts.push(`${q}${name}`);
  }
  return parts.slice(0, 2).join(" ");
}

function phrase(a: number): string | null {
  if (a < 45) return null;
  if (a < 90) return "a minute";
  if (a < 45 * 60) return `${roundDivNum(a, 60)} minutes`;
  if (a < 90 * 60) return "an hour";
  if (a < 22 * 3600) return `${roundDivNum(a, 3600)} hours`;
  if (a < 36 * 3600) return "a day";
  if (a < 26 * 86400) return `${roundDivNum(a, 86400)} days`;
  if (a < 46 * 86400) return "a month";
  if (a < 320 * 86400) return `${roundDivNum(a, 2629746)} months`; // average Gregorian month
  if (a < 548 * 86400) return "a year";
  return `${roundDivNum(a, 31556952)} years`; // average Gregorian year
}

/** Positive deltas (seconds) are in the future ("in 3 hours"), negative in the past ("3 hours ago"). */
export function relativeTime(deltaSeconds: number): string {
  if (!Number.isSafeInteger(deltaSeconds)) throw new RangeError("deltaSeconds must be an integer");
  const p = phrase(Math.abs(deltaSeconds));
  if (p === null) return "just now";
  return deltaSeconds > 0 ? `in ${p}` : `${p} ago`;
}
