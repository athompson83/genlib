// SPDX-License-Identifier: Apache-2.0

//! `Set-Cookie` serialization (RFC 6265 plus current browser rules for
//! SameSite, Partitioned and the `__Secure-` / `__Host-` prefixes) and
//! `Cookie` request header parsing.

use std::fmt;

/// Invalid cookie name, value or attribute combination.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CookieError(pub String);

impl fmt::Display for CookieError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CookieError {}

/// `Set-Cookie` attributes; `None` / `false` are not written. `same_site` must
/// be `Strict`, `Lax` or `None` (exact case).
#[derive(Clone, Debug, Default)]
pub struct CookieOptions<'a> {
    pub max_age: Option<i64>,
    /// Unix seconds, written as an IMF-fixdate.
    pub expires: Option<i64>,
    pub domain: Option<&'a str>,
    pub path: Option<&'a str>,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: Option<&'a str>,
    pub partitioned: bool,
}

fn tchar(c: u8) -> bool {
    c.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&c)
}

fn cookie_octet(c: u8) -> bool {
    c == 0x21 || (0x23..=0x2b).contains(&c) || (0x2d..=0x3a).contains(&c) || (0x3c..=0x5b).contains(&c) || (0x5d..=0x7e).contains(&c)
}

fn valid_domain(d: &str) -> bool {
    let d = d.strip_prefix('.').unwrap_or(d);
    d.split('.').all(|label| {
        let b = label.as_bytes();
        !b.is_empty() && b[0].is_ascii_alphanumeric() && b[b.len() - 1].is_ascii_alphanumeric() && b.iter().all(|&c| c.is_ascii_alphanumeric() || c == b'-')
    })
}

const DAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// Formats unix seconds as `Wed, 21 Oct 2026 07:28:00 GMT`.
pub fn imf_fixdate(unix: i64) -> String {
    let day = unix.div_euclid(86_400);
    let sec = unix.rem_euclid(86_400);
    let z = day + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    let wd = (day + 3).rem_euclid(7) as usize; // 1970-01-01 was a Thursday
    format!("{}, {:02} {} {:04} {:02}:{:02}:{:02} GMT", DAYS[wd], d, MONTHS[(m - 1) as usize], y, sec / 3600, sec / 60 % 60, sec % 60)
}

fn err<T>(m: &str) -> Result<T, CookieError> {
    Err(CookieError(m.into()))
}

/// Builds a `Set-Cookie` header value. The caller encodes values containing
/// characters outside cookie-octet.
pub fn serialize_cookie(name: &str, value: &str, o: &CookieOptions) -> Result<String, CookieError> {
    if name.is_empty() || !name.bytes().all(tchar) {
        return err("name must be an RFC 7230 token");
    }
    if !value.bytes().all(cookie_octet) {
        return err("value has characters outside cookie-octet; encode it first");
    }
    if o.domain.is_some_and(|d| !valid_domain(d)) {
        return err("invalid domain");
    }
    if o.path.is_some_and(|p| !p.starts_with('/') || p.chars().any(|c| c < ' ' || c == '\x7f' || c == ';')) {
        return err("path must start with / and contain no controls or ;");
    }
    if o.same_site.is_some_and(|s| !matches!(s, "Strict" | "Lax" | "None")) {
        return err("SameSite must be Strict, Lax or None");
    }
    if o.same_site == Some("None") && !o.secure {
        return err("SameSite=None requires Secure");
    }
    if o.partitioned && !o.secure {
        return err("Partitioned requires Secure");
    }
    if name.starts_with("__Secure-") && !o.secure {
        return err("__Secure- requires Secure");
    }
    if name.starts_with("__Host-") && (!o.secure || o.domain.is_some() || o.path != Some("/")) {
        return err("__Host- requires Secure, Path=/ and no Domain");
    }
    if o.max_age.is_some_and(|m| m < 0) {
        return err("Max-Age must be a non-negative integer");
    }
    let mut out = vec![format!("{name}={value}")];
    if let Some(m) = o.max_age {
        out.push(format!("Max-Age={m}"));
    }
    if let Some(e) = o.expires {
        out.push(format!("Expires={}", imf_fixdate(e)));
    }
    if let Some(d) = o.domain {
        out.push(format!("Domain={}", d.to_ascii_lowercase()));
    }
    if let Some(p) = o.path {
        out.push(format!("Path={p}"));
    }
    if o.secure {
        out.push("Secure".into());
    }
    if o.http_only {
        out.push("HttpOnly".into());
    }
    if let Some(s) = o.same_site {
        out.push(format!("SameSite={s}"));
    }
    if o.partitioned {
        out.push("Partitioned".into());
    }
    Ok(out.join("; "))
}

/// Splits a `Cookie` request header into ordered (name, value) pairs, keeping
/// duplicates.
pub fn parse_cookie_header(header: &str) -> Vec<(String, String)> {
    header
        .split(';')
        .filter_map(|piece| {
            let (n, v) = piece.split_once('=')?;
            let (n, v) = (n.trim_matches([' ', '\t']), v.trim_matches([' ', '\t']));
            if n.is_empty() {
                return None;
            }
            let v = if v.len() >= 2 && v.starts_with('"') && v.ends_with('"') { &v[1..v.len() - 1] } else { v };
            Some((n.to_string(), v.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> CookieOptions<'static> {
        CookieOptions::default()
    }

    #[test]
    fn serialize() {
        for (name, value, o, want) in [
            ("sid", "abc123", CookieOptions { path: Some("/"), secure: true, http_only: true, same_site: Some("Lax"), ..opts() }, "sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"),
            ("__Host-session", "x.y.z", CookieOptions { path: Some("/"), secure: true, http_only: true, same_site: Some("Strict"), max_age: Some(3600), ..opts() }, "__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict"),
            ("theme", "dark", CookieOptions { max_age: Some(0), expires: Some(1_792_567_680), domain: Some("Example.COM"), path: Some("/app"), ..opts() }, "theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app"),
            ("embed", "1", CookieOptions { secure: true, same_site: Some("None"), partitioned: true, ..opts() }, "embed=1; Secure; SameSite=None; Partitioned"),
            ("empty", "", opts(), "empty="),
        ] {
            assert_eq!(serialize_cookie(name, value, &o).as_deref(), Ok(want), "{name}");
        }
    }

    #[test]
    fn invalid() {
        for (name, value, o) in [
            ("bad name", "v", opts()),
            ("n", "a;b", opts()),
            ("n", "a b", opts()),
            ("n", "a\"b", opts()),
            ("n", "v", CookieOptions { same_site: Some("None"), ..opts() }),
            ("__Secure-x", "v", opts()),
            ("__Host-x", "v", CookieOptions { secure: true, path: Some("/a"), ..opts() }),
            ("__Host-x", "v", CookieOptions { secure: true, path: Some("/"), domain: Some("example.com"), ..opts() }),
            ("n", "v", CookieOptions { path: Some("relative"), ..opts() }),
            ("n", "v", CookieOptions { same_site: Some("lax"), ..opts() }),
            ("n", "v", CookieOptions { partitioned: true, ..opts() }),
            ("n", "v", CookieOptions { max_age: Some(-1), ..opts() }),
            ("", "v", opts()),
        ] {
            assert!(serialize_cookie(name, value, &o).is_err(), "{name} {value} {o:?}");
        }
    }

    #[test]
    fn parse() {
        let pairs = |v: &[(&str, &str)]| v.iter().map(|(a, b)| (a.to_string(), b.to_string())).collect::<Vec<_>>();
        assert_eq!(parse_cookie_header("sid=abc; theme=dark"), pairs(&[("sid", "abc"), ("theme", "dark")]));
        assert_eq!(parse_cookie_header(" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x"), pairs(&[("a", "1"), ("b", "2"), ("c", "quoted value"), ("d", "=x")]));
        assert_eq!(parse_cookie_header("a=1; a=2"), pairs(&[("a", "1"), ("a", "2")]));
        assert_eq!(parse_cookie_header(""), pairs(&[]));
    }

    #[test]
    fn dates() {
        assert_eq!(imf_fixdate(0), "Thu, 01 Jan 1970 00:00:00 GMT");
        assert_eq!(imf_fixdate(-1), "Wed, 31 Dec 1969 23:59:59 GMT");
        assert_eq!(imf_fixdate(951_782_400), "Tue, 29 Feb 2000 00:00:00 GMT");
    }
}
