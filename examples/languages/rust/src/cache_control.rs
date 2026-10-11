// SPDX-License-Identifier: Apache-2.0

//! `Cache-Control` (RFC 9111) parsing, formatting and freshness lifetime.
//! Names are lowercased and the first occurrence wins; delta directives
//! (max-age, s-maxage, stale-while-revalidate, stale-if-error, max-stale,
//! min-fresh) must be ASCII digits (quoted digits accepted) and become integers
//! (saturating at `u64::MAX`), invalid ones are dropped; a bare max-stale is a
//! flag; unparseable items are skipped up to the next comma.

use std::fmt;

/// Unterminated quoted string.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CacheControlError(pub String);

impl fmt::Display for CacheControlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "cache-control: {}", self.0)
    }
}

impl std::error::Error for CacheControlError {}

/// A directive value: a bare flag, delta seconds, or a string argument.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CacheValue {
    Flag,
    Seconds(u64),
    Text(String),
}

const DELTA: &[&str] = &["max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh"];

fn is_token_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&c)
}

/// Parses a Cache-Control value into ordered (directive, value) pairs.
pub fn parse_cache_control(value: &str) -> Result<Vec<(String, CacheValue)>, CacheControlError> {
    let s = value.as_bytes();
    let n = s.len();
    let mut i = 0;
    let mut out: Vec<(String, CacheValue)> = Vec::new();
    let next_comma = |i: usize| s[i..].iter().position(|&c| c == b',').map_or(n, |p| i + p);
    while i < n {
        while i < n && matches!(s[i], b' ' | b'\t' | b',') {
            i += 1;
        }
        if i >= n {
            break;
        }
        let start = i;
        while i < n && is_token_char(s[i]) {
            i += 1;
        }
        if i == start {
            i = next_comma(i);
            continue;
        }
        let name = value[start..i].to_ascii_lowercase();
        let mut val = CacheValue::Flag;
        while i < n && matches!(s[i], b' ' | b'\t') {
            i += 1;
        }
        if i < n && s[i] == b'=' {
            i += 1;
            while i < n && matches!(s[i], b' ' | b'\t') {
                i += 1;
            }
            if i < n && s[i] == b'"' {
                i += 1;
                let mut buf = Vec::new();
                loop {
                    if i >= n {
                        return Err(CacheControlError("unterminated quote".into()));
                    }
                    let c = s[i];
                    if c == b'\\' && i + 1 < n {
                        buf.push(s[i + 1]);
                        i += 2;
                        continue;
                    }
                    i += 1;
                    if c == b'"' {
                        break;
                    }
                    buf.push(c);
                }
                val = CacheValue::Text(String::from_utf8_lossy(&buf).into_owned());
            } else {
                let start = i;
                while i < n && is_token_char(s[i]) {
                    i += 1;
                }
                val = CacheValue::Text(value[start..i].to_string());
            }
        }
        i = next_comma(i);
        if DELTA.contains(&name.as_str()) {
            match &val {
                CacheValue::Flag if name != "max-stale" => continue,
                CacheValue::Text(t) => {
                    if t.is_empty() || !t.bytes().all(|c| c.is_ascii_digit()) {
                        continue;
                    }
                    val = CacheValue::Seconds(t.parse().unwrap_or(u64::MAX));
                }
                _ => {}
            }
        }
        if !out.iter().any(|(k, _)| *k == name) {
            out.push((name, val));
        }
    }
    Ok(out)
}

/// Renders directives in order: flags as the bare name, seconds as name=N, strings quoted unless they are tokens.
pub fn format_cache_control<S: AsRef<str>>(directives: &[(S, CacheValue)]) -> String {
    directives
        .iter()
        .map(|(k, v)| {
            let k = k.as_ref();
            match v {
                CacheValue::Flag => k.to_string(),
                CacheValue::Seconds(n) => format!("{k}={n}"),
                CacheValue::Text(t) if !t.is_empty() && t.bytes().all(is_token_char) => format!("{k}={t}"),
                CacheValue::Text(t) => format!("{k}=\"{}\"", t.replace('\\', "\\\\").replace('"', "\\\"")),
            }
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Returns the freshness lifetime in seconds: 0 for no-store/no-cache, s-maxage for shared caches, else max-age, else `None`.
pub fn cache_freshness<S: AsRef<str>>(directives: &[(S, CacheValue)], shared: bool) -> Option<u64> {
    let get = |name: &str| directives.iter().find(|(k, _)| k.as_ref() == name).map(|(_, v)| v);
    if get("no-store").is_some() || get("no-cache").is_some() {
        return Some(0);
    }
    if shared {
        if let Some(CacheValue::Seconds(n)) = get("s-maxage") {
            return Some(*n);
        }
    }
    match get("max-age") {
        Some(CacheValue::Seconds(n)) => Some(*n),
        _ => None,
    }
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn parse_vectors() {
        assert_eq!(parse_cache_control("public, max-age=600"), Ok(vec![("public".to_string(), CacheValue::Flag), ("max-age".to_string(), CacheValue::Seconds(600))]));
        assert_eq!(parse_cache_control("no-store"), Ok(vec![("no-store".to_string(), CacheValue::Flag)]));
        assert_eq!(parse_cache_control("private=\"set-cookie, x-y\", max-age=0"), Ok(vec![("private".to_string(), CacheValue::Text("set-cookie, x-y".to_string())), ("max-age".to_string(), CacheValue::Seconds(0))]));
        assert_eq!(parse_cache_control("max-age=\"120\", s-maxage=60, must-revalidate"), Ok(vec![("max-age".to_string(), CacheValue::Seconds(120)), ("s-maxage".to_string(), CacheValue::Seconds(60)), ("must-revalidate".to_string(), CacheValue::Flag)]));
        assert_eq!(parse_cache_control("max-age=abc, max-age=30"), Ok(vec![("max-age".to_string(), CacheValue::Seconds(30))]));
        assert_eq!(parse_cache_control("MAX-AGE=5, Max-Age=9"), Ok(vec![("max-age".to_string(), CacheValue::Seconds(5))]));
        assert_eq!(parse_cache_control("max-stale"), Ok(vec![("max-stale".to_string(), CacheValue::Flag)]));
        assert_eq!(parse_cache_control("max-stale=120, min-fresh=10"), Ok(vec![("max-stale".to_string(), CacheValue::Seconds(120)), ("min-fresh".to_string(), CacheValue::Seconds(10))]));
        assert_eq!(parse_cache_control("stale-while-revalidate=30, immutable"), Ok(vec![("stale-while-revalidate".to_string(), CacheValue::Seconds(30)), ("immutable".to_string(), CacheValue::Flag)]));
        assert_eq!(parse_cache_control(",, public ,,"), Ok(vec![("public".to_string(), CacheValue::Flag)]));
        assert_eq!(parse_cache_control("no-cache=\"Set-Cookie\""), Ok(vec![("no-cache".to_string(), CacheValue::Text("Set-Cookie".to_string()))]));
        assert_eq!(parse_cache_control("foo=bar, baz=\"q\\\"t\""), Ok(vec![("foo".to_string(), CacheValue::Text("bar".to_string())), ("baz".to_string(), CacheValue::Text("q\"t".to_string()))]));
        assert_eq!(parse_cache_control("max-age=99999999999999999999999"), Ok(vec![("max-age".to_string(), CacheValue::Seconds(u64::MAX))]));
    }

    #[test]
    fn format_vectors() {
        let d = vec![("public".to_string(), CacheValue::Flag), ("max-age".to_string(), CacheValue::Seconds(600))];
        assert_eq!(format_cache_control(&d), "public, max-age=600");
        assert_eq!(parse_cache_control("public, max-age=600"), Ok(d));
        let d = vec![("private".to_string(), CacheValue::Text("set-cookie, x".to_string())), ("no-cache".to_string(), CacheValue::Flag)];
        assert_eq!(format_cache_control(&d), "private=\"set-cookie, x\", no-cache");
        assert_eq!(parse_cache_control("private=\"set-cookie, x\", no-cache"), Ok(d));
        let d = vec![("s-maxage".to_string(), CacheValue::Seconds(0)), ("stale-if-error".to_string(), CacheValue::Seconds(86400))];
        assert_eq!(format_cache_control(&d), "s-maxage=0, stale-if-error=86400");
        assert_eq!(parse_cache_control("s-maxage=0, stale-if-error=86400"), Ok(d));
    }

    #[test]
    fn freshness_vectors() {
        let cases: &[(&str, bool, Option<u64>)] = &[
            ("max-age=600", false, Some(600)),
            ("max-age=600, s-maxage=60", true, Some(60)),
            ("max-age=600, s-maxage=60", false, Some(600)),
            ("no-store, max-age=600", false, Some(0)),
            ("no-cache", true, Some(0)),
            ("public", false, None),
        ];
        for &(s, shared, want) in cases {
            assert_eq!(cache_freshness(&parse_cache_control(s).unwrap(), shared), want, "{s:?}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for s in &["private=\"unterminated"] {
            assert!(parse_cache_control(s).is_err(), "{s:?}");
        }
    }
}
