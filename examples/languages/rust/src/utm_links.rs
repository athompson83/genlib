// SPDX-License-Identifier: Apache-2.0

//! Campaign (UTM) links: build, parse and strip click-tracking parameters.
//! Standard library only; no network access. Existing query parameters keep
//! their order and original encoding.

use std::fmt;

/// UTM keys (without `utm_`) in output order.
pub const UTM_KEYS: [&str; 6] = ["id", "source", "medium", "campaign", "term", "content"];

/// Non-UTM click identifiers removed by [`strip_tracking`].
pub const TRACKING_PARAMS: [&str; 14] = [
    "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "mc_cid", "mc_eid", "_hsenc",
    "_hsmi", "yclid", "igshid",
];

/// Validation error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UtmError(pub String);

impl fmt::Display for UtmError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for UtmError {}

fn err<T>(message: impl Into<String>) -> Result<T, UtmError> {
    Err(UtmError(message.into()))
}

/// Campaign values. `source`, `medium` and `campaign` are required.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Utm<'a> {
    pub source: &'a str,
    pub medium: &'a str,
    pub campaign: &'a str,
    pub term: Option<&'a str>,
    pub content: Option<&'a str>,
    pub id: Option<&'a str>,
}

/// Splits a URL into (base, query, fragment); query and fragment exclude `?`/`#`.
fn split_url(url: &str) -> (&str, Option<&str>, Option<&str>) {
    let (rest, fragment) = match url.find('#') {
        Some(i) => (&url[..i], Some(&url[i + 1..])),
        None => (url, None),
    };
    match rest.find('?') {
        Some(i) => (&rest[..i], Some(&rest[i + 1..]), fragment),
        None => (rest, None, fragment),
    }
}

fn params(query: Option<&str>) -> Vec<&str> {
    query.map(|q| q.split('&').filter(|p| !p.is_empty()).collect()).unwrap_or_default()
}

fn raw_key(param: &str) -> &str {
    param.split('=').next().unwrap_or("")
}

fn join(base: &str, params: &[String], fragment: Option<&str>) -> String {
    let mut out = base.to_string();
    if !params.is_empty() {
        out.push('?');
        out.push_str(&params.join("&"));
    }
    if let Some(f) = fragment {
        out.push('#');
        out.push_str(f);
    }
    out
}

/// Percent-encodes UTF-8, keeping RFC 3986 unreserved characters.
pub fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Decodes `%XX` sequences and `+` (as a space) into UTF-8 text.
pub fn percent_decode(value: &str) -> Result<String, UtmError> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' => {
                let hex = |j: usize| bytes.get(j).and_then(|c| (*c as char).to_digit(16));
                match (hex(i + 1), hex(i + 2)) {
                    (Some(hi), Some(lo)) => out.push((hi * 16 + lo) as u8),
                    _ => return err(format!("malformed percent-encoding in {value:?}")),
                }
                i += 2;
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8(out).map_err(|_| UtmError(format!("percent-encoded value is not UTF-8: {value:?}")))
}

fn validate_base(url: &str) -> Result<(), UtmError> {
    let lower = url.to_ascii_lowercase();
    let rest = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://"));
    let ok = rest.is_some_and(|r| !r.is_empty() && !r.starts_with(['/', '?', '#']))
        && !url.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok {
        Ok(())
    } else {
        err(format!("base URL must be an absolute http(s) URL: {url:?}"))
    }
}

/// Appends (or replaces in place) `utm_*` parameters, trimmed and lowercased.
pub fn build_utm_url(base_url: &str, utm: &Utm) -> Result<String, UtmError> {
    validate_base(base_url)?;
    let required = [("source", utm.source), ("medium", utm.medium), ("campaign", utm.campaign)];
    for (name, value) in required {
        if value.trim().is_empty() {
            return err(format!("{name} is required"));
        }
    }
    let values = [
        ("id", utm.id),
        ("source", Some(utm.source)),
        ("medium", Some(utm.medium)),
        ("campaign", Some(utm.campaign)),
        ("term", utm.term),
        ("content", utm.content),
    ];
    let (base, query, fragment) = split_url(base_url);
    let mut out: Vec<String> = params(query).into_iter().map(str::to_string).collect();
    for (name, value) in values {
        let Some(value) = value.map(str::trim).filter(|v| !v.is_empty()) else { continue };
        let key = format!("utm_{name}");
        let param = format!("{key}={}", percent_encode(&value.to_lowercase()));
        match out.iter().position(|p| raw_key(p) == key) {
            Some(pos) => {
                out[pos] = param;
                let mut index = 0;
                out.retain(|p| {
                    index += 1;
                    index - 1 == pos || raw_key(p) != key
                });
            }
            None => out.push(param),
        }
    }
    Ok(join(base, &out, fragment))
}

/// Returns the present UTM values (keys without `utm_`) in [`UTM_KEYS`] order.
/// The first occurrence of a key wins.
pub fn parse_utm(url: &str) -> Result<Vec<(String, String)>, UtmError> {
    let (_, query, _) = split_url(url);
    let mut found: Vec<Option<String>> = vec![None; UTM_KEYS.len()];
    for param in params(query) {
        let (k, v) = param.split_once('=').unwrap_or((param, ""));
        let key = percent_decode(k)?;
        if let Some(slot) = key.strip_prefix("utm_").and_then(|n| UTM_KEYS.iter().position(|u| *u == n)) {
            if found[slot].is_none() {
                found[slot] = Some(percent_decode(v)?);
            }
        }
    }
    Ok(UTM_KEYS
        .iter()
        .zip(found)
        .filter_map(|(k, v)| v.map(|v| ((*k).to_string(), v)))
        .collect())
}

/// Removes `utm_*` and known click identifiers, keeping other parameters
/// in order with their original encoding, and keeping the fragment.
pub fn strip_tracking(url: &str) -> String {
    let (base, query, fragment) = split_url(url);
    let kept: Vec<String> = params(query)
        .into_iter()
        .filter(|p| {
            let k = raw_key(p);
            !k.starts_with("utm_") && !TRACKING_PARAMS.contains(&k)
        })
        .map(str::to_string)
        .collect();
    join(base, &kept, fragment)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_vectors() {
        let fall = Utm { source: "Newsletter", medium: "email", campaign: "Fall Sale", ..Default::default() };
        assert_eq!(
            build_utm_url("https://ex.com/p?ref=a#top", &fall).unwrap(),
            "https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top"
        );
        let hero = Utm { source: "x", medium: "y", campaign: "z", content: Some("Hero CTA"), ..Default::default() };
        assert_eq!(
            build_utm_url("https://ex.com/?utm_source=old", &hero).unwrap(),
            "https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta"
        );
    }

    #[test]
    fn build_order_and_rejections() {
        let all = Utm {
            source: " S ",
            medium: "m",
            campaign: "c",
            term: Some("Running Shoes"),
            content: Some("a/b"),
            id: Some("ID-7"),
        };
        assert_eq!(
            build_utm_url("http://ex.com", &all).unwrap(),
            "http://ex.com?utm_id=id-7&utm_source=s&utm_medium=m&utm_campaign=c&utm_term=running%20shoes&utm_content=a%2Fb"
        );
        let ok = Utm { source: "s", medium: "m", campaign: "c", ..Default::default() };
        assert!(build_utm_url("ex.com/p", &ok).is_err());
        assert!(build_utm_url("ftp://ex.com/", &ok).is_err());
        assert!(build_utm_url("https:///p", &ok).is_err());
        assert!(build_utm_url("https://ex.com/", &Utm { campaign: "  ", ..ok.clone() }).is_err());
        assert!(build_utm_url("https://ex.com/", &Utm { source: "", ..ok }).is_err());
    }

    #[test]
    fn parse_vector() {
        let got = parse_utm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup").unwrap();
        assert_eq!(
            got,
            vec![("source".to_string(), "news letter".to_string()), ("campaign".to_string(), "fall sale".to_string())]
        );
        assert!(parse_utm("https://ex.com/").unwrap().is_empty());
        assert!(parse_utm("https://ex.com/?utm_source=%E2%82%AC#x").unwrap()[0].1 == "€");
        assert!(parse_utm("https://ex.com/?utm_source=%zz").is_err());
    }

    #[test]
    fn strip_vectors() {
        assert_eq!(strip_tracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"), "https://ex.com/p?id=7&b=2#s");
        assert_eq!(strip_tracking("https://ex.com/?fbclid=1"), "https://ex.com/");
        assert_eq!(strip_tracking("https://ex.com/?q=a%20b&igshid=9&_hsenc=x"), "https://ex.com/?q=a%20b");
    }
}
