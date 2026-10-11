// SPDX-License-Identifier: Apache-2.0

//! Glob matching for '/'-separated paths: `*`, `?` and `[...]` never cross '/',
//! a whole-segment `**` matches zero or more segments, `{a,b}` alternatives (no
//! nesting) are expanded first and `\` escapes the next character. A segment
//! starting with '.' is matched only by a pattern segment starting with a
//! literal '.' unless `dot` is true. Case-sensitive, one code point per `?`.

use std::collections::HashMap;
use std::fmt;

/// Invalid glob pattern, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlobError(pub String);

impl fmt::Display for GlobError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "glob: {}", self.0)
    }
}

impl std::error::Error for GlobError {}

fn err<T>(m: &str) -> Result<T, GlobError> {
    Err(GlobError(m.to_string()))
}

fn expand_braces(p: &[char]) -> Result<Vec<Vec<char>>, GlobError> {
    let mut start = None;
    let mut k = 0;
    while k < p.len() {
        match p[k] {
            '\\' => {
                k += 2;
                continue;
            }
            '{' => {
                start = Some(k);
                break;
            }
            '}' => return err("unmatched }"),
            _ => k += 1,
        }
    }
    let Some(i) = start else { return Ok(vec![p.to_vec()]) };
    let mut parts: Vec<Vec<char>> = Vec::new();
    let mut cur = Vec::new();
    let mut j = i + 1;
    let mut closed = false;
    while j < p.len() {
        match p[j] {
            '\\' => {
                cur.extend_from_slice(&p[j..(j + 2).min(p.len())]);
                j += 2;
            }
            '{' => return err("nested braces are not supported"),
            ',' => {
                parts.push(std::mem::take(&mut cur));
                j += 1;
            }
            '}' => {
                parts.push(std::mem::take(&mut cur));
                closed = true;
                break;
            }
            c => {
                cur.push(c);
                j += 1;
            }
        }
    }
    if !closed {
        return err("unterminated {");
    }
    let mut res = Vec::new();
    for alt in parts {
        let mut next = p[..i].to_vec();
        next.extend(alt);
        next.extend_from_slice(&p[j + 1..]);
        res.extend(expand_braces(&next)?);
    }
    Ok(res)
}

struct Seg<'a> {
    pat: &'a [char],
    s: &'a [char],
    memo: HashMap<(usize, usize), bool>,
}

impl Seg<'_> {
    fn m(&mut self, mut pi: usize, mut si: usize) -> Result<bool, GlobError> {
        let key = (pi, si);
        if let Some(&v) = self.memo.get(&key) {
            return Ok(v);
        }
        let (pat, s) = (self.pat, self.s);
        let r = 'outer: loop {
            if pi >= pat.len() {
                break si == s.len();
            }
            let mut c = pat[pi];
            if c == '*' {
                while pi < pat.len() && pat[pi] == '*' {
                    pi += 1;
                }
                if pi == pat.len() {
                    break true;
                }
                for k in si..=s.len() {
                    if self.m(pi, k)? {
                        break 'outer true;
                    }
                }
                break false;
            }
            if si >= s.len() {
                break false;
            }
            if c == '?' {
                pi += 1;
                si += 1;
                continue;
            }
            if c == '[' {
                let mut j = pi + 1;
                let mut neg = false;
                if j < pat.len() && (pat[j] == '!' || pat[j] == '^') {
                    neg = true;
                    j += 1;
                }
                let (mut hit, mut first) = (false, true);
                loop {
                    if j >= pat.len() {
                        return err("unterminated [");
                    }
                    if pat[j] == ']' && !first {
                        break;
                    }
                    first = false;
                    let mut a = pat[j];
                    if a == '\\' && j + 1 < pat.len() {
                        j += 1;
                        a = pat[j];
                    }
                    if j + 2 < pat.len() && pat[j + 1] == '-' && pat[j + 2] != ']' {
                        let mut b = pat[j + 2];
                        if b == '\\' && j + 3 < pat.len() {
                            j += 1;
                            b = pat[j + 2];
                        }
                        hit |= a <= s[si] && s[si] <= b;
                        j += 3;
                    } else {
                        hit |= a == s[si];
                        j += 1;
                    }
                }
                if hit == neg {
                    break false;
                }
                pi = j + 1;
                si += 1;
                continue;
            }
            if c == '\\' {
                if pi + 1 >= pat.len() {
                    return err("trailing backslash");
                }
                c = pat[pi + 1];
                pi += 1;
            }
            if s[si] != c {
                break false;
            }
            pi += 1;
            si += 1;
        };
        self.memo.insert(key, r);
        Ok(r)
    }
}

fn seg_match(pat: &[char], s: &[char], dot: bool) -> Result<bool, GlobError> {
    if !dot && s.first() == Some(&'.') && pat.first() != Some(&'.') && !(pat.len() > 1 && pat[0] == '\\' && pat[1] == '.') {
        return Ok(false);
    }
    Seg { pat, s, memo: HashMap::new() }.m(0, 0)
}

fn split_segments(p: &[char]) -> Vec<Vec<char>> {
    let mut segs = Vec::new();
    let mut cur = Vec::new();
    let mut k = 0;
    while k < p.len() {
        if p[k] == '\\' && k + 1 < p.len() {
            cur.push(p[k]);
            cur.push(p[k + 1]);
            k += 2;
        } else if p[k] == '/' {
            segs.push(std::mem::take(&mut cur));
            k += 1;
        } else {
            cur.push(p[k]);
            k += 1;
        }
    }
    segs.push(cur);
    segs
}

struct Paths<'a> {
    ps: &'a [Vec<char>],
    ss: &'a [Vec<char>],
    dot: bool,
    memo: HashMap<(usize, usize), bool>,
}

impl Paths<'_> {
    fn m(&mut self, i: usize, j: usize) -> Result<bool, GlobError> {
        if let Some(&v) = self.memo.get(&(i, j)) {
            return Ok(v);
        }
        let (ps, ss) = (self.ps, self.ss);
        let mut r = false;
        if i == ps.len() {
            r = j == ss.len();
        } else if ps[i] == ['*', '*'] {
            for k in j..=ss.len() {
                if k > j && !self.dot && ss[k - 1].first() == Some(&'.') {
                    break;
                }
                if self.m(i + 1, k)? {
                    r = true;
                    break;
                }
            }
        } else if j < ss.len() && seg_match(&ps[i], &ss[j], self.dot)? {
            r = self.m(i + 1, j + 1)?;
        }
        self.memo.insert((i, j), r);
        Ok(r)
    }
}

fn validate(p: &[char]) -> Result<(), GlobError> {
    if p.is_empty() {
        return err("empty pattern");
    }
    if p.iter().rev().take_while(|&&c| c == '\\').count() % 2 == 1 {
        return err("trailing backslash");
    }
    let mut k = 0;
    while k < p.len() {
        if p[k] == '\\' {
            k += 2;
            continue;
        }
        if p[k] == '[' {
            let mut j = k + 1;
            if j < p.len() && (p[j] == '!' || p[j] == '^') {
                j += 1;
            }
            if j < p.len() && p[j] == ']' {
                j += 1;
            }
            while j < p.len() && p[j] != ']' {
                j += if p[j] == '\\' { 2 } else { 1 };
            }
            if j >= p.len() {
                return err("unterminated [");
            }
            k = j;
        }
        k += 1;
    }
    Ok(())
}

/// Reports whether `path` matches `pattern`; `dot` lets wildcards match segments starting with '.'.
pub fn glob_match(pattern: &str, path: &str, dot: bool) -> Result<bool, GlobError> {
    let p: Vec<char> = pattern.chars().collect();
    validate(&p)?;
    let ss: Vec<Vec<char>> = path.split('/').map(|s| s.chars().collect()).collect();
    for alt in expand_braces(&p)? {
        let ps = split_segments(&alt);
        if (Paths { ps: &ps, ss: &ss, dot, memo: HashMap::new() }).m(0, 0)? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Returns the paths that match `pattern`, in their original order.
pub fn glob_filter<S: AsRef<str>>(pattern: &str, paths: &[S], dot: bool) -> Result<Vec<String>, GlobError> {
    let mut out = Vec::new();
    for p in paths {
        if glob_match(pattern, p.as_ref(), dot)? {
            out.push(p.as_ref().to_string());
        }
    }
    Ok(out)
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn match_vectors() {
        let cases: &[(&str, &str, bool, bool)] = &[
            ("*.js", "a.js", false, true),
            ("*.js", "a/b.js", false, false),
            ("**/*.js", "a/b/c.js", false, true),
            ("**/*.js", "c.js", false, true),
            ("src/**", "src", false, true),
            ("src/**", "src/a/b.ts", false, true),
            ("src/**/test/*.py", "src/test/x.py", false, true),
            ("src/**/test/*.py", "src/a/b/test/x.py", false, true),
            ("a?c", "abc", false, true),
            ("a?c", "a/c", false, false),
            ("[a-c]x", "bx", false, true),
            ("[!a-c]x", "bx", false, false),
            ("[!a-c]x", "dx", false, true),
            ("[^0-9]", "x", false, true),
            ("[]a]", "a", false, true),
            ("[]a]", "]", false, true),
            ("*.{js,ts}", "x.ts", false, true),
            ("*.{js,ts}", "x.tsx", false, false),
            ("{src,lib}/**/*.go", "lib/x/y.go", false, true),
            (".*", ".env", false, true),
            ("*", ".env", false, false),
            ("*", ".env", true, true),
            ("**/x", ".git/x", false, false),
            ("**/x", ".git/x", true, true),
            ("a\\*b", "a*b", false, true),
            ("a\\*b", "axb", false, false),
            ("*", "", false, true),
            ("**", "a/b/c", false, true),
            ("a/**/b", "a/b", false, true),
            ("a/**/b", "a/x/y/b", false, true),
            ("*.txt", "notes.TXT", false, false),
            ("[a-z]*.md", "Readme.md", false, false),
            ("docs/*", "docs/a/b", false, false),
            ("?", "\u{e9}", false, true),
        ];
        for &(p, s, dot, want) in cases {
            assert_eq!(glob_match(p, s, dot), Ok(want), "{p:?} {s:?} {dot}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for p in &["[abc", "{a,b", "a{b{c}}", "", "x\\"] {
            assert!(glob_match(p, "x", false).is_err(), "{p:?}");
        }
    }

    #[test]
    fn filter_and_no_blowup() {
        let got = glob_filter("src/**/*.go", &["src/a.go", "src/x/b.go", "lib/c.go", "src/.hidden/d.go", "src/e.txt"], false).unwrap();
        assert_eq!(got, ["src/a.go", "src/x/b.go"]);
        assert!(glob_filter("[", &["a"], false).is_err());
        let path = "a/".repeat(30) + "b";
        assert_eq!(glob_match(&("**/".repeat(12) + "c"), &path, false), Ok(false));
        assert_eq!(glob_match(&("*a".repeat(20) + "b"), &"a".repeat(60), false), Ok(false));
    }
}
