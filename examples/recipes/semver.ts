// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Semantic Versioning 2.0.0 parse/compare and npm-style range checks. Original source; copy and adapt.
// Supports exact, =, >, >=, <, <=, ^, ~, x-ranges (1.x, 1.2.*, *), hyphen ranges (1.2 - 2.3.4),
// space (AND) and || (OR). Not supported: loose/coerced versions and a leading "v" in ranges.

export interface SemVer { major: number; minor: number; patch: number; prerelease: Array<string | number>; build: string[] }
interface Comparator { op: "<" | "<=" | ">" | ">=" | "="; version: SemVer; sentinel: boolean }

const NUM = "0|[1-9]\\d*";
const PRE = `(?:${NUM}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const FULL = new RegExp(`^v?(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${PRE}(?:\\.${PRE})*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$`);
const PARTIAL = /^(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemVer(text: string): SemVer {
  const m = FULL.exec(text.trim());
  if (!m) throw new RangeError(`Invalid semantic version: ${text}`);
  const nums = [m[1], m[2], m[3]].map(Number);
  if (nums.some((n) => !Number.isSafeInteger(n))) throw new RangeError("Version number too large");
  return {
    major: nums[0] ?? 0, minor: nums[1] ?? 0, patch: nums[2] ?? 0,
    prerelease: m[4] ? m[4].split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [],
    build: m[5] ? m[5].split(".") : [],
  };
}

/** -1, 0 or 1 by SemVer precedence. Build metadata is ignored. */
export function compareSemVer(a: SemVer | string, b: SemVer | string): -1 | 0 | 1 {
  const x = typeof a === "string" ? parseSemVer(a) : a;
  const y = typeof b === "string" ? parseSemVer(b) : b;
  for (const k of ["major", "minor", "patch"] as const) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
  if (!x.prerelease.length || !y.prerelease.length) return x.prerelease.length === y.prerelease.length ? 0 : x.prerelease.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    const p = x.prerelease[i];
    const q = y.prerelease[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === "number" && typeof q === "number") return p < q ? -1 : 1;
    if (typeof p === "number") return -1; // numeric identifiers sort before alphanumeric
    if (typeof q === "number") return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

export const sortSemVer = (versions: readonly string[]): string[] => [...versions].sort(compareSemVer);

const v = (major: number, minor: number, patch: number, pre: Array<string | number> = []): SemVer => ({ major, minor, patch, prerelease: pre, build: [] });
const isX = (part: string | undefined) => part === undefined || /^[xX*]$/.test(part);

function partial(text: string) {
  const m = PARTIAL.exec(text);
  if (!m) throw new RangeError(`Invalid range version: ${text}`);
  const [maj, min, pat] = [m[1], m[2], m[3]];
  const xIndex = isX(maj) ? 0 : isX(min) ? 1 : isX(pat) ? 2 : 3; // first wildcard position, 3 = none
  const n = (s: string | undefined) => (isX(s) ? 0 : Number(s));
  const pre = xIndex === 3 && m[4] ? parseSemVer(`0.0.0-${m[4]}`).prerelease : [];
  return { xIndex, version: v(n(maj), n(min), n(pat), pre) };
}

const c = (op: Comparator["op"], version: SemVer, sentinel = false): Comparator => ({ op, version, sentinel });
/** Exclusive upper bound "<X.Y.Z-0" that also excludes prereleases of X.Y.Z. */
function bump(p: SemVer, index: number): Comparator {
  const next = index === 0 ? v(p.major + 1, 0, 0, [0]) : index === 1 ? v(p.major, p.minor + 1, 0, [0]) : v(p.major, p.minor, p.patch + 1, [0]);
  return c("<", next, true);
}

function expand(token: string): Comparator[] {
  const m = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(token);
  if (!m || !m[2]) throw new RangeError(`Invalid comparator: ${token}`);
  const op = m[1] ?? "";
  const { xIndex, version } = partial(m[2]);
  if (xIndex === 0) return op === "<" || op === ">" ? [c("<", v(0, 0, 0, [0]), true)] : []; // "*" matches everything
  switch (op) {
    case "^": {
      const i = version.major > 0 || xIndex === 1 ? 0 : version.minor > 0 || xIndex === 2 ? 1 : 2;
      return [c(">=", version), bump(version, i)];
    }
    case "~": return [c(">=", version), bump(version, xIndex === 1 ? 0 : 1)];
    case "":
    case "=": return xIndex < 3 ? [c(">=", version), bump(version, xIndex - 1)] : [c("=", version)];
    case ">": return xIndex < 3 ? [c(">=", bump(version, xIndex - 1).version, true)] : [c(">", version)];
    case "<=": return xIndex < 3 ? [bump(version, xIndex - 1)] : [c("<=", version)];
    case "<": return xIndex < 3 ? [c("<", v(version.major, version.minor, version.patch, [0]), true)] : [c("<", version)];
    default: return [c(">=", version)];
  }
}

function parseRange(range: string): Comparator[][] {
  return range.split("||").map((part) => {
    const text = part.trim().replace(/(\^|~|>=|<=|>|<|=)\s+/g, "$1");
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(text);
    if (hyphen) {
      const low = partial(hyphen[1] ?? "");
      const high = partial(hyphen[2] ?? "");
      if (low.xIndex === 0) return high.xIndex === 0 ? [] : expand(`<=${hyphen[2]}`);
      return [c(">=", low.version), ...(high.xIndex === 0 ? [] : expand(`<=${hyphen[2]}`))];
    }
    return text === "" ? [] : text.split(/\s+/).flatMap(expand);
  });
}

function check(comparator: Comparator, version: SemVer): boolean {
  const r = compareSemVer(version, comparator.version);
  switch (comparator.op) {
    case "=": return r === 0;
    case ">": return r > 0;
    case ">=": return r >= 0;
    case "<": return r < 0;
    case "<=": return r <= 0;
  }
}

/** npm semantics: a prerelease matches only when a comparator in the same set names a prerelease of the same x.y.z. */
export function satisfies(version: string, range: string, options: { includePrerelease?: boolean } = {}): boolean {
  const ver = parseSemVer(version);
  return parseRange(range).some((set) => {
    if (!set.every((comparator) => check(comparator, ver))) return false;
    if (!ver.prerelease.length || options.includePrerelease) return true;
    return set.some(({ version: x, sentinel }) => !sentinel && x.prerelease.length > 0
      && x.major === ver.major && x.minor === ver.minor && x.patch === ver.patch);
  });
}

/** Highest version satisfying the range, or null. */
export function maxSatisfying(versions: readonly string[], range: string): string | null {
  return sortSemVer(versions.filter((x) => satisfies(x, range))).at(-1) ?? null;
}
