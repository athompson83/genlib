// SPDX-License-Identifier: Apache-2.0

//! Semantic Versioning 2.0.0 parsing and precedence, plus npm-style range
//! matching (`||`, comparators, `^`, `~`, x-ranges and hyphen ranges) desugared
//! the way node-semver does. Prerelease versions only match a comparator set
//! that names a prerelease of the same major.minor.patch.

use std::cmp::Ordering;
use std::fmt;

/// Parse or range error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SemverError(pub String);

impl fmt::Display for SemverError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SemverError {}

fn err<T>(m: impl Into<String>) -> Result<T, SemverError> {
    Err(SemverError(m.into()))
}

/// A prerelease identifier: numeric identifiers sort numerically and before alphanumeric ones.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Ident {
    Num(u64),
    Alpha(String),
}

/// A parsed version. Build metadata is kept but ignored by [`compare`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Version {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
    pub pre: Vec<Ident>,
    pub build: Vec<String>,
}

fn numeric(s: &str, what: &str) -> Result<u64, SemverError> {
    if s.is_empty() || !s.bytes().all(|b| b.is_ascii_digit()) {
        return err(format!("{what} must be digits: {s:?}"));
    }
    if s.len() > 1 && s.starts_with('0') {
        return err(format!("{what} must not have leading zeros: {s:?}"));
    }
    s.parse().map_err(|_| SemverError(format!("{what} is too large: {s:?}")))
}

fn idents<'a>(s: &'a str, what: &str) -> Result<Vec<&'a str>, SemverError> {
    let parts: Vec<&str> = s.split('.').collect();
    for p in &parts {
        if p.is_empty() || !p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
            return err(format!("invalid {what} identifier: {p:?}"));
        }
    }
    Ok(parts)
}

fn parse_pre(s: &str) -> Result<Vec<Ident>, SemverError> {
    idents(s, "prerelease")?
        .into_iter()
        .map(|p| {
            if p.bytes().all(|b| b.is_ascii_digit()) {
                numeric(p, "numeric prerelease identifier").map(Ident::Num)
            } else {
                Ok(Ident::Alpha(p.to_string()))
            }
        })
        .collect()
}

/// Strict SemVer 2.0.0 parse (no `v` prefix, no leading zeros, no whitespace).
pub fn parse(text: &str) -> Result<Version, SemverError> {
    let (rest, build) = match text.split_once('+') {
        Some((r, b)) => (r, idents(b, "build")?.into_iter().map(str::to_string).collect()),
        None => (text, Vec::new()),
    };
    let (core, pre) = match rest.split_once('-') {
        Some((c, p)) => (c, parse_pre(p)?),
        None => (rest, Vec::new()),
    };
    let nums: Vec<&str> = core.split('.').collect();
    if nums.len() != 3 {
        return err(format!("version must be MAJOR.MINOR.PATCH: {text:?}"));
    }
    Ok(Version {
        major: numeric(nums[0], "major")?,
        minor: numeric(nums[1], "minor")?,
        patch: numeric(nums[2], "patch")?,
        pre,
        build,
    })
}

fn cmp_ident(a: &Ident, b: &Ident) -> Ordering {
    match (a, b) {
        (Ident::Num(x), Ident::Num(y)) => x.cmp(y),
        (Ident::Num(_), Ident::Alpha(_)) => Ordering::Less,
        (Ident::Alpha(_), Ident::Num(_)) => Ordering::Greater,
        (Ident::Alpha(x), Ident::Alpha(y)) => x.as_bytes().cmp(y.as_bytes()),
    }
}

fn cmp_versions(a: &Version, b: &Version) -> Ordering {
    (a.major, a.minor, a.patch).cmp(&(b.major, b.minor, b.patch)).then_with(|| match (a.pre.is_empty(), b.pre.is_empty()) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => {
            for (x, y) in a.pre.iter().zip(&b.pre) {
                let o = cmp_ident(x, y);
                if o != Ordering::Equal {
                    return o;
                }
            }
            a.pre.len().cmp(&b.pre.len())
        }
    })
}

/// SemVer precedence (spec section 11); build metadata is ignored.
pub fn compare(a: &str, b: &str) -> Result<Ordering, SemverError> {
    Ok(cmp_versions(&parse(a)?, &parse(b)?))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Op {
    Eq,
    Gt,
    Gte,
    Lt,
    Lte,
}

#[derive(Clone, Debug)]
struct Comparator {
    op: Op,
    version: Version,
    /// The `-0` upper bound produced by desugaring; never admits a prerelease.
    synthetic: bool,
}

impl Comparator {
    fn test(&self, v: &Version) -> bool {
        let o = cmp_versions(v, &self.version);
        match self.op {
            Op::Eq => o == Ordering::Equal,
            Op::Gt => o == Ordering::Greater,
            Op::Gte => o != Ordering::Less,
            Op::Lt => o == Ordering::Less,
            Op::Lte => o != Ordering::Greater,
        }
    }
}

/// A possibly partial version: `None` components are wildcards.
struct Partial {
    major: Option<u64>,
    minor: Option<u64>,
    patch: Option<u64>,
    pre: Vec<Ident>,
}

fn parse_partial(s: &str) -> Result<Partial, SemverError> {
    let s = s.strip_prefix('v').unwrap_or(s);
    if s.is_empty() {
        return err("empty version in range");
    }
    let (rest, _build) = s.split_once('+').map_or((s, ""), |(r, b)| (r, b));
    let (core, pre) = match rest.split_once('-') {
        Some((c, p)) => (c, parse_pre(p)?),
        None => (rest, Vec::new()),
    };
    let parts: Vec<&str> = core.split('.').collect();
    if parts.len() > 3 {
        return err(format!("too many version components: {s:?}"));
    }
    let mut nums = [None, None, None];
    let mut wild = false;
    for (i, p) in parts.iter().enumerate() {
        if matches!(*p, "x" | "X" | "*") {
            wild = true;
        } else if wild {
            return err(format!("a number cannot follow a wildcard: {s:?}"));
        } else {
            nums[i] = Some(numeric(p, "version component")?);
        }
    }
    if !pre.is_empty() && nums[2].is_none() {
        return err(format!("a prerelease needs a full version: {s:?}"));
    }
    Ok(Partial { major: nums[0], minor: nums[1], patch: nums[2], pre })
}

fn ver(major: u64, minor: u64, patch: u64, pre: Vec<Ident>) -> Version {
    Version { major, minor, patch, pre, build: Vec::new() }
}

fn inc(n: u64) -> Result<u64, SemverError> {
    n.checked_add(1).ok_or_else(|| SemverError("version component overflow".into()))
}

fn c(op: Op, version: Version) -> Comparator {
    Comparator { op, version, synthetic: false }
}

/// `< version-0`: the synthetic exclusive upper bound.
fn upper(major: u64, minor: u64, patch: u64) -> Comparator {
    Comparator { op: Op::Lt, version: ver(major, minor, patch, vec![Ident::Num(0)]), synthetic: true }
}

fn never() -> Comparator {
    Comparator { op: Op::Lt, version: ver(0, 0, 0, vec![Ident::Num(0)]), synthetic: true }
}

/// Desugars one comparator token (operator attached) into primitive comparators.
fn desugar(token: &str, out: &mut Vec<Comparator>) -> Result<(), SemverError> {
    let (kind, rest) = ["~>", ">=", "<=", "^", "~", ">", "<", "="]
        .iter()
        .find_map(|op| token.strip_prefix(op).map(|r| (*op, r)))
        .unwrap_or(("", token));
    let p = parse_partial(rest)?;
    // A wildcard major (`*`, `x`, `^*`, `>=*`, ...) matches every release; `>*` and `<*` match nothing.
    let Some(major) = p.major else {
        if matches!(kind, ">" | "<") {
            out.push(never());
        }
        return Ok(());
    };
    match kind {
        "^" => match (p.minor, p.patch) {
            (None, _) => {
                out.push(c(Op::Gte, ver(major, 0, 0, vec![])));
                out.push(upper(inc(major)?, 0, 0));
            }
            (Some(minor), None) => {
                out.push(c(Op::Gte, ver(major, minor, 0, vec![])));
                out.push(if major > 0 { upper(inc(major)?, 0, 0) } else { upper(0, inc(minor)?, 0) });
            }
            (Some(minor), Some(patch)) => {
                out.push(c(Op::Gte, ver(major, minor, patch, p.pre)));
                out.push(if major > 0 {
                    upper(inc(major)?, 0, 0)
                } else if minor > 0 {
                    upper(0, inc(minor)?, 0)
                } else {
                    upper(0, 0, inc(patch)?)
                });
            }
        },
        "~" | "~>" => match (p.minor, p.patch) {
            (None, _) => {
                out.push(c(Op::Gte, ver(major, 0, 0, vec![])));
                out.push(upper(inc(major)?, 0, 0));
            }
            (Some(minor), patch) => {
                out.push(c(Op::Gte, ver(major, minor, patch.unwrap_or(0), p.pre)));
                out.push(upper(major, inc(minor)?, 0));
            }
        },
        "" | "=" => match (p.minor, p.patch) {
            (None, _) => {
                out.push(c(Op::Gte, ver(major, 0, 0, vec![])));
                out.push(upper(inc(major)?, 0, 0));
            }
            (Some(minor), None) => {
                out.push(c(Op::Gte, ver(major, minor, 0, vec![])));
                out.push(upper(major, inc(minor)?, 0));
            }
            (Some(minor), Some(patch)) => out.push(c(Op::Eq, ver(major, minor, patch, p.pre))),
        },
        ">" => match (p.minor, p.patch) {
            (None, _) => out.push(c(Op::Gte, ver(inc(major)?, 0, 0, vec![]))),
            (Some(minor), None) => out.push(c(Op::Gte, ver(major, inc(minor)?, 0, vec![]))),
            (Some(minor), Some(patch)) => out.push(c(Op::Gt, ver(major, minor, patch, p.pre))),
        },
        ">=" => out.push(c(Op::Gte, ver(major, p.minor.unwrap_or(0), p.patch.unwrap_or(0), p.pre))),
        "<" => match (p.minor, p.patch) {
            (None, _) => out.push(upper(major, 0, 0)),
            (Some(minor), None) => out.push(upper(major, minor, 0)),
            (Some(minor), Some(patch)) => out.push(c(Op::Lt, ver(major, minor, patch, p.pre))),
        },
        "<=" => match (p.minor, p.patch) {
            (None, _) => out.push(upper(inc(major)?, 0, 0)),
            (Some(minor), None) => out.push(upper(major, inc(minor)?, 0)),
            (Some(minor), Some(patch)) => out.push(c(Op::Lte, ver(major, minor, patch, p.pre))),
        },
        _ => unreachable!(),
    }
    Ok(())
}

fn parse_set(set: &str) -> Result<Vec<Comparator>, SemverError> {
    let tokens: Vec<&str> = set.split_whitespace().collect();
    let mut out = Vec::new();
    if tokens.len() == 3 && tokens[1] == "-" {
        let (lo, hi) = (parse_partial(tokens[0])?, parse_partial(tokens[2])?);
        if let Some(major) = lo.major {
            out.push(c(Op::Gte, ver(major, lo.minor.unwrap_or(0), lo.patch.unwrap_or(0), lo.pre)));
        }
        match (hi.major, hi.minor, hi.patch) {
            (None, _, _) => {}
            (Some(major), None, _) => out.push(upper(inc(major)?, 0, 0)),
            (Some(major), Some(minor), None) => out.push(upper(major, inc(minor)?, 0)),
            (Some(major), Some(minor), Some(patch)) => out.push(c(Op::Lte, ver(major, minor, patch, hi.pre))),
        }
        return Ok(out);
    }
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i];
        if t == "-" {
            return err("a hyphen range must be exactly `A - B`");
        }
        // Allow a detached operator such as `>= 1.2.3`.
        if matches!(t, ">" | ">=" | "<" | "<=" | "=" | "^" | "~" | "~>") {
            let Some(next) = tokens.get(i + 1) else { return err(format!("operator {t:?} has no version")) };
            desugar(&format!("{t}{next}"), &mut out)?;
            i += 2;
        } else {
            desugar(t, &mut out)?;
            i += 1;
        }
    }
    Ok(out)
}

/// Whether `version` satisfies the npm-style `range`.
pub fn satisfies(version: &str, range: &str) -> Result<bool, SemverError> {
    let v = parse(version)?;
    let mut sets = Vec::new();
    for set in range.split("||") {
        sets.push(parse_set(set)?);
    }
    Ok(sets.iter().any(|set| {
        set.iter().all(|cmp| cmp.test(&v))
            && (v.pre.is_empty()
                || set.iter().any(|cmp| {
                    !cmp.synthetic
                        && !cmp.version.pre.is_empty()
                        && (cmp.version.major, cmp.version.minor, cmp.version.patch) == (v.major, v.minor, v.patch)
                }))
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sort_vector() {
        let mut input = vec![
            "1.0.0-rc.1", "2.0.0", "1.0.0", "1.0.0-beta.11", "1.0.0-alpha", "1.0.0+build.5", "1.0.0-beta.2",
            "0.9.9", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-alpha.1",
        ];
        input.sort_by(|a, b| compare(a, b).unwrap());
        assert_eq!(
            input,
            [
                "0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
                "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0",
            ]
        );
        assert_eq!(compare("1.0.0", "1.0.0+build.5").unwrap(), Ordering::Equal);
    }

    #[test]
    fn parse_strict() {
        let v = parse("1.2.3-alpha.1+sha.5").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (1, 2, 3));
        assert_eq!(v.pre, vec![Ident::Alpha("alpha".into()), Ident::Num(1)]);
        assert_eq!(v.build, vec!["sha", "5"]);
        for bad in ["1.2", "1.2.3.4", "01.2.3", "1.02.3", "1.2.3-01", "1.2.3-", "1.2.3+", "1.2.3-a..b", "v1.2.3",
            " 1.2.3", "1.2.3-a_b", "99999999999999999999.0.0"]
        {
            assert!(parse(bad).is_err(), "{bad}");
        }
        assert!(parse("1.2.3-0a").is_ok());
    }

    #[test]
    fn satisfies_vectors() {
        let cases: [(&str, &str, bool); 18] = [
            ("1.2.3", "^1.0.0", true),
            ("2.0.0", "^1.0.0", false),
            ("0.2.5", "^0.2.3", true),
            ("0.3.0", "^0.2.3", false),
            ("0.0.4", "^0.0.3", false),
            ("1.2.9", "~1.2.3", true),
            ("1.3.0", "~1.2.3", false),
            ("1.5.0", "1.x", true),
            ("1.5.0", ">=1.2.0 <1.5.0", false),
            ("1.4.9", ">=1.2.0 <1.5.0", true),
            ("3.1.0", "^1.0.0 || ^3.0.0", true),
            ("1.2.3-beta.2", "^1.2.3-beta.1", true),
            ("1.2.4-beta.1", "^1.2.3-beta.1", false),
            ("1.3.0-rc.1", "^1.2.0", false),
            ("1.2.0", "1.0.0 - 1.2.0", true),
            ("1.2.1", "1.0.0 - 1.2.0", false),
            ("0.0.1", "*", true),
            ("2.0.0", "<=1.x", false),
        ];
        for (v, r, want) in cases {
            assert_eq!(satisfies(v, r).unwrap(), want, "{v} {r}");
        }
    }

    #[test]
    fn satisfies_extra() {
        assert!(satisfies("1.9.9", "<=1.x").unwrap());
        assert!(satisfies("1.2.3", ">= 1.2.3").unwrap());
        assert!(!satisfies("1.0.0-beta", "*").unwrap());
        assert!(!satisfies("1.0.0", ">*").unwrap());
        assert!(satisfies("1.2.3", "").unwrap());
        assert!(satisfies("1.2.0", "~1.2").unwrap());
        assert!(!satisfies("1.3.0", "~1.2").unwrap());
        assert!(satisfies("0.0.9", "^0.0").unwrap());
        assert!(satisfies("2.0.0", ">1").unwrap());
        assert!(!satisfies("1.9.0", ">1").unwrap());
        assert!(satisfies("1.2.3", "=1.2.3").unwrap());
        assert!(satisfies("1.2.3", "1.2.3+b").unwrap());
        assert!(satisfies("1.0.0", "1 - 2").unwrap());
        assert!(satisfies("2.9.9", "1 - 2").unwrap());
        assert!(!satisfies("3.0.0", "1 - 2").unwrap());
        for bad in ["^1.2.3.4", "1.x.3", ">=", "1 - ", "a.b.c", "1.2-beta"] {
            assert!(satisfies("1.2.3", bad).is_err(), "{bad}");
        }
        assert!(satisfies("1.2", "*").is_err());
    }
}
