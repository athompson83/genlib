// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: glob matching for "/"-separated paths (gitignore-style **, braces, classes). Original source.
// "*" matches a run and "?" one code point, "[...]" one code point from a class ("[!...]"/"[^...]" negate,
// ranges, "]" first is literal); none cross "/". A whole-segment "**" matches zero or more segments (so
// "src/**" matches "src") and, without dot, never descends into segments starting with ".". "{a,b}" (not
// nested) expands first; "\" escapes. A leading "." needs a literal "." unless dot. Memoized: no blowup.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart glob-match modules.

type Cps = string[];

function expandBraces(p: Cps): Cps[] {
  let i = -1;
  for (let k = 0; k < p.length; k++) {
    if (p[k] === "\\") { k++; continue; }
    if (p[k] === "{") { i = k; break; }
    if (p[k] === "}") throw new RangeError("unmatched }");
  }
  if (i < 0) return [p];
  const parts: Cps[] = [];
  let cur: Cps = [];
  let j = i + 1;
  for (;; j++) {
    if (j >= p.length) throw new RangeError("unterminated {");
    const c = p[j]!;
    if (c === "\\") { cur.push(...p.slice(j, j + 2)); j++; continue; }
    if (c === "{") throw new RangeError("nested braces are not supported");
    if (c === ",") { parts.push(cur); cur = []; continue; }
    if (c === "}") { parts.push(cur); break; }
    cur.push(c);
  }
  return parts.flatMap((alt) => expandBraces([...p.slice(0, i), ...alt, ...p.slice(j + 1)]));
}

function segMatch(pat: Cps, s: Cps, dot: boolean): boolean {
  if (!dot && s[0] === "." && pat[0] !== "." && !(pat[0] === "\\" && pat[1] === ".")) return false;
  const memo = new Map<number, boolean>();
  const m = (pi: number, si: number): boolean => {
    const key = pi * (s.length + 1) + si;
    let hit = memo.get(key);
    if (hit === undefined) { hit = run(pi, si); memo.set(key, hit); }
    return hit;
  };
  const run = (pi: number, si: number): boolean => {
    while (pi < pat.length) {
      let c = pat[pi]!;
      if (c === "*") {
        while (pi < pat.length && pat[pi] === "*") pi++;
        if (pi === pat.length) return true;
        for (let k = si; k <= s.length; k++) if (m(pi, k)) return true;
        return false;
      }
      if (si >= s.length) return false;
      const ch = s[si]!.codePointAt(0)!;
      if (c === "?") { pi++; si++; continue; }
      if (c === "[") {
        let j = pi + 1;
        let neg = false;
        if (j < pat.length && (pat[j] === "!" || pat[j] === "^")) { neg = true; j++; }
        let hit = false;
        for (let first = true; ; first = false) {
          if (j >= pat.length) throw new RangeError("unterminated [");
          if (pat[j] === "]" && !first) break;
          let a = pat[j]!;
          if (a === "\\" && j + 1 < pat.length) a = pat[++j]!;
          let b = a;
          if (j + 2 < pat.length && pat[j + 1] === "-" && pat[j + 2] !== "]") {
            b = pat[j + 2]!;
            if (b === "\\" && j + 3 < pat.length) b = pat[++j + 2]!;
            j += 3;
          } else j++;
          if (a.codePointAt(0)! <= ch && ch <= b.codePointAt(0)!) hit = true;
        }
        if (hit === neg) return false;
        pi = j + 1; si++;
        continue;
      }
      if (c === "\\") {
        if (pi + 1 >= pat.length) throw new RangeError("trailing backslash");
        c = pat[++pi]!;
      }
      if (s[si] !== c) return false;
      pi++; si++;
    }
    return si === s.length;
  };
  return m(0, 0);
}

function splitSegments(p: Cps): Cps[] {
  const segs: Cps[] = [];
  let cur: Cps = [];
  for (let k = 0; k < p.length; k++) {
    if (p[k] === "\\" && k + 1 < p.length) { cur.push(p[k]!, p[k + 1]!); k++; continue; }
    if (p[k] === "/") { segs.push(cur); cur = []; continue; }
    cur.push(p[k]!);
  }
  segs.push(cur);
  return segs;
}

function matchOne(pattern: Cps, path: string, dot: boolean): boolean {
  const ps = splitSegments(pattern);
  const ss = path.split("/").map((seg) => Array.from(seg));
  const memo = new Map<number, boolean>();
  const m = (i: number, j: number): boolean => {
    const key = i * (ss.length + 1) + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let res = false;
    if (i === ps.length) res = j === ss.length;
    else if (ps[i]!.join("") === "**") {
      for (let k = j; k <= ss.length; k++) {
        if (k > j && !dot && ss[k - 1]![0] === ".") break;
        if (m(i + 1, k)) { res = true; break; }
      }
    } else res = j < ss.length && segMatch(ps[i]!, ss[j]!, dot) && m(i + 1, j + 1);
    memo.set(key, res);
    return res;
  };
  return m(0, 0);
}

function compile(pattern: string): Cps[] {
  if (pattern === "") throw new RangeError("empty pattern");
  const p = Array.from(pattern);
  let trailing = 0;
  while (trailing < p.length && p[p.length - 1 - trailing] === "\\") trailing++;
  if (trailing % 2 === 1) throw new RangeError("trailing backslash");
  for (let k = 0; k < p.length; k++) {
    if (p[k] === "\\") { k++; continue; }
    if (p[k] !== "[") continue;
    let j = k + 1;
    if (p[j] === "!" || p[j] === "^") j++;
    if (p[j] === "]") j++;
    while (j < p.length && p[j] !== "]") j += p[j] === "\\" ? 2 : 1;
    if (j >= p.length) throw new RangeError("unterminated [");
    k = j;
  }
  return expandBraces(p);
}

/** True when the "/"-separated path matches the glob; RangeError for a malformed pattern. */
export function globMatch(pattern: string, path: string, dot = false): boolean {
  return compile(pattern).some((alt) => matchOne(alt, path, dot));
}

/** The paths that match the glob, in their original order. */
export function globFilter(pattern: string, paths: readonly string[], dot = false): string[] {
  const alts = compile(pattern);
  return paths.filter((path) => alts.some((alt) => matchOne(alt, path, dot)));
}
