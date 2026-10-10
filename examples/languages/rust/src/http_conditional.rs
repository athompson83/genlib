// SPDX-License-Identifier: Apache-2.0

//! Entity tags and conditional requests evaluated in RFC 9110 section 13.2.2
//! order.

/// A parsed `If-Match` / `If-None-Match` value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ETags {
    /// The header was `*`.
    Any,
    /// Valid entity tags in order (invalid items are ignored).
    List(Vec<String>),
}

fn etagc(c: char) -> bool {
    let c = c as u32;
    c == 0x21 || (0x23..=0x7e).contains(&c) || (0x80..=0xff).contains(&c)
}

fn valid_etag(s: &str) -> bool {
    let s = s.strip_prefix("W/").unwrap_or(s);
    s.len() >= 2 && s.starts_with('"') && s.ends_with('"') && s[1..s.len() - 1].chars().all(etagc)
}

/// Parses a comma-separated entity-tag list or `*`.
pub fn parse_etags(header: &str) -> ETags {
    let h = header.trim_matches([' ', '\t']);
    if h == "*" {
        return ETags::Any;
    }
    ETags::List(h.split(',').map(|p| p.trim_matches([' ', '\t'])).filter(|p| valid_etag(p)).map(String::from).collect())
}

/// Neither tag is weak and both are identical.
pub fn strong_match(a: &str, b: &str) -> bool {
    !a.starts_with("W/") && !b.starts_with("W/") && a == b
}

/// Identical after removing a leading `W/`.
pub fn weak_match(a: &str, b: &str) -> bool {
    a.strip_prefix("W/").unwrap_or(a) == b.strip_prefix("W/").unwrap_or(b)
}

/// The current representation's validators and the request's conditional
/// headers; `None` means absent / not sent.
#[derive(Clone, Debug, Default)]
pub struct Conditional<'a> {
    pub method: &'a str,
    pub etag: Option<&'a str>,
    /// Unix seconds.
    pub last_modified: Option<i64>,
    pub if_match: Option<&'a str>,
    pub if_none_match: Option<&'a str>,
    pub if_modified_since: Option<&'a str>,
    pub if_unmodified_since: Option<&'a str>,
}

const DAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468
}

fn month_days(y: i64, m: i64) -> i64 {
    match m {
        2 if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn num(s: &str) -> Option<i64> {
    if s.bytes().all(|c| c.is_ascii_digit()) {
        s.parse().ok()
    } else {
        None
    }
}

/// Parses an IMF-fixdate (`Wed, 21 Oct 2026 07:28:00 GMT`) that round-trips
/// exactly, including the weekday, into unix seconds.
pub fn parse_http_date(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if !s.is_ascii() || b.len() != 29 || &s[3..5] != ", " || b[7] != b' ' || b[11] != b' ' || b[16] != b' ' || b[19] != b':' || b[22] != b':' || &s[25..] != " GMT" {
        return None;
    }
    let (d, y, hh, mm, ss) = (num(&s[5..7])?, num(&s[12..16])?, num(&s[17..19])?, num(&s[20..22])?, num(&s[23..25])?);
    let m = MONTHS.iter().position(|&x| x == &s[8..11])? as i64 + 1;
    if y < 1 || d < 1 || d > month_days(y, m) || hh > 23 || mm > 59 || ss > 59 {
        return None;
    }
    let day = days_from_civil(y, m, d);
    if DAYS[(day + 3).rem_euclid(7) as usize] != &s[..3] {
        return None;
    }
    Some(day * 86_400 + hh * 3600 + mm * 60 + ss)
}

/// Returns 200, 304 or 412 for the request.
pub fn evaluate_conditional(r: &Conditional) -> u16 {
    let safe = r.method == "GET" || r.method == "HEAD";
    if let Some(h) = r.if_match {
        let ok = match parse_etags(h) {
            ETags::Any => r.etag.is_some(),
            ETags::List(tags) => r.etag.is_some_and(|e| tags.iter().any(|t| strong_match(t, e))),
        };
        if !ok {
            return 412;
        }
    } else if let (Some(h), Some(lm)) = (r.if_unmodified_since, r.last_modified) {
        if parse_http_date(h).is_some_and(|d| lm > d) {
            return 412;
        }
    }
    if let Some(h) = r.if_none_match {
        let hit = match parse_etags(h) {
            ETags::Any => r.etag.is_some(),
            ETags::List(tags) => r.etag.is_some_and(|e| tags.iter().any(|t| weak_match(t, e))),
        };
        if hit {
            return if safe { 304 } else { 412 };
        }
    } else if let (Some(h), Some(lm), true) = (r.if_modified_since, r.last_modified, safe) {
        if parse_http_date(h).is_some_and(|d| lm <= d) {
            return 304;
        }
    }
    200
}

#[cfg(test)]
mod tests {
    use super::*;

    const LM: i64 = 1_792_567_680; // Wed, 21 Oct 2026 07:28:00 GMT
    const D: &str = "Wed, 21 Oct 2026 07:28:00 GMT";
    const EARLY: &str = "Tue, 20 Oct 2026 07:28:00 GMT";

    fn req(method: &str) -> Conditional<'_> {
        Conditional { method, ..Default::default() }
    }

    #[test]
    fn cases() {
        let cases: Vec<(Conditional, u16)> = vec![
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("\"v2\""), ..req("GET") }, 304),
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("W/\"v2\""), ..req("GET") }, 304),
            (Conditional { etag: Some("W/\"v2\""), if_none_match: Some("\"v1\", \"v2\""), ..req("GET") }, 304),
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("\"v1\""), ..req("GET") }, 200),
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("*"), ..req("HEAD") }, 304),
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("*"), ..req("PUT") }, 412),
            (Conditional { if_none_match: Some("*"), ..req("PUT") }, 200),
            (Conditional { etag: Some("\"v2\""), if_match: Some("\"v2\""), ..req("PUT") }, 200),
            (Conditional { etag: Some("\"v2\""), if_match: Some("\"v1\""), ..req("PUT") }, 412),
            (Conditional { etag: Some("W/\"v2\""), if_match: Some("W/\"v2\""), ..req("PUT") }, 412),
            (Conditional { if_match: Some("*"), ..req("DELETE") }, 412),
            (Conditional { etag: Some("\"a\""), if_match: Some("*"), ..req("DELETE") }, 200),
            (Conditional { etag: Some("\"v2\""), last_modified: Some(LM), if_modified_since: Some(D), ..req("GET") }, 304),
            (Conditional { etag: Some("\"v2\""), last_modified: Some(LM), if_modified_since: Some(EARLY), ..req("GET") }, 200),
            (Conditional { etag: Some("\"v2\""), last_modified: Some(LM), if_none_match: Some("\"v1\""), if_modified_since: Some(D), ..req("GET") }, 200),
            (Conditional { last_modified: Some(LM), if_modified_since: Some(D), ..req("POST") }, 200),
            (Conditional { last_modified: Some(LM), if_unmodified_since: Some(EARLY), ..req("PUT") }, 412),
            (Conditional { last_modified: Some(LM), if_unmodified_since: Some(D), ..req("PUT") }, 200),
            (Conditional { last_modified: Some(LM), if_modified_since: Some("Wednesday, 21-Oct-26 07:28:00 GMT"), ..req("GET") }, 200),
            (Conditional { etag: Some("\"v2\""), if_none_match: Some("v2"), ..req("GET") }, 200),
            (Conditional { etag: Some("\"v2\""), if_match: Some("\"v2\""), if_unmodified_since: Some(EARLY), ..req("PUT") }, 200),
        ];
        for (i, (c, want)) in cases.iter().enumerate() {
            assert_eq!(evaluate_conditional(c), *want, "case {i}: {c:?}");
        }
    }

    #[test]
    fn parse() {
        let list = |v: &[&str]| ETags::List(v.iter().map(|s| s.to_string()).collect());
        assert_eq!(parse_etags("\"a\", W/\"b\" ,\"c\""), list(&["\"a\"", "W/\"b\"", "\"c\""]));
        assert_eq!(parse_etags("*"), ETags::Any);
        assert_eq!(parse_etags(" * "), ETags::Any);
        assert_eq!(parse_etags("W/\"x\", bogus, \"y\""), list(&["W/\"x\"", "\"y\""]));
        assert_eq!(parse_etags("\"\""), list(&["\"\""]));
    }

    #[test]
    fn http_date() {
        assert_eq!(parse_http_date(D), Some(LM));
        for bad in ["Thu, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 24:00:00 GMT", "Wed, 1 Oct 2026 07:28:00 GMT", "Sun, 29 Feb 2026 00:00:00 GMT", "Wed, 21 oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:0é GMT"] {
            assert_eq!(parse_http_date(bad), None, "{bad}");
        }
    }
}
