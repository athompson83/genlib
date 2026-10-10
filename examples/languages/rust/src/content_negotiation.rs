// SPDX-License-Identifier: Apache-2.0

//! `Accept` and `Accept-Language` negotiation (RFC 9110 section 12.5, RFC 4647
//! basic filtering). The most specific matching range sets each available
//! value's q; the highest q > 0 wins and ties go to the earlier entry.

struct Item {
    value: String,
    q: f64,
}

fn valid_q(v: &str) -> bool {
    let b = v.as_bytes();
    if b.is_empty() || (b[0] != b'0' && b[0] != b'1') {
        return false;
    }
    if b.len() == 1 {
        return true;
    }
    b[1] == b'.' && b.len() <= 5 && b[2..].iter().all(|&c| if b[0] == b'1' { c == b'0' } else { c.is_ascii_digit() })
}

fn parse(header: &str) -> Vec<Item> {
    let mut out = Vec::new();
    for part in header.split(',') {
        let part = part.trim_matches([' ', '\t']);
        if part.is_empty() {
            continue;
        }
        let mut bits = part.split(';');
        let value = bits.next().unwrap_or("").trim_matches([' ', '\t']).to_lowercase();
        let mut q = Some(1.0);
        for p in bits {
            let p = p.trim_matches([' ', '\t']);
            let (k, v) = p.split_once('=').unwrap_or((p, ""));
            if k.trim().to_lowercase() != "q" {
                continue;
            }
            let v = v.trim();
            q = if valid_q(v) { v.trim_end_matches('.').parse().ok() } else { None };
            if q.is_none() {
                break;
            }
        }
        if let Some(q) = q {
            out.push(Item { value, q });
        }
    }
    out
}

fn token(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"!#$%&'*+.^_`|~-".contains(&c))
}

fn pick<'a>(items: &[Item], available: &[&'a str], specificity: impl Fn(&str, &str) -> u32) -> Option<&'a str> {
    let (mut best, mut best_q) = (None, 0.0);
    for &a in available {
        let lower = a.to_lowercase();
        let (mut spec, mut q) = (0, 0.0);
        for it in items {
            let s = specificity(&it.value, &lower);
            if s > spec {
                spec = s;
                q = it.q;
            }
        }
        if spec > 0 && q > best_q {
            best = Some(a);
            best_q = q;
        }
    }
    best
}

/// Best available media type for an `Accept` header; `None` or a blank header
/// means any (the first available). Returns `None` when nothing is acceptable.
pub fn negotiate_media_type<'a>(accept: Option<&str>, available: &[&'a str]) -> Option<&'a str> {
    let accept = accept.unwrap_or("");
    if accept.trim().is_empty() {
        return available.first().copied();
    }
    let ranges: Vec<Item> = parse(accept)
        .into_iter()
        .filter(|it| matches!(it.value.split_once('/'), Some((t, s)) if token(t) && token(s)))
        .collect();
    pick(&ranges, available, |range, avail| {
        let (rt, rs) = range.split_once('/').unwrap_or_default();
        match avail.split_once('/') {
            Some((t, s)) if rt == t && rs == s => 3,
            Some((t, _)) if rt == t && rs == "*" => 2,
            Some(_) if rt == "*" && rs == "*" => 1,
            _ => 0,
        }
    })
}

fn language_range(r: &str) -> bool {
    r == "*"
        || r.split('-').enumerate().all(|(i, sub)| {
            !sub.is_empty() && sub.len() <= 8 && sub.bytes().all(|c| c.is_ascii_lowercase() || (i > 0 && c.is_ascii_digit()))
        })
}

/// Best available language tag (original case) for an `Accept-Language`
/// header using RFC 4647 basic filtering.
pub fn negotiate_language<'a>(accept_language: Option<&str>, available: &[&'a str]) -> Option<&'a str> {
    let header = accept_language.unwrap_or("");
    if header.trim().is_empty() {
        return available.first().copied();
    }
    let ranges: Vec<Item> = parse(header).into_iter().filter(|it| language_range(&it.value)).collect();
    pick(&ranges, available, |range, tag| {
        if range == "*" {
            1
        } else if tag == range || (tag.starts_with(range) && tag[range.len()..].starts_with('-')) {
            2 + range.matches('-').count() as u32
        } else {
            0
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_type() {
        let available = ["application/json", "text/html", "text/csv"];
        for (header, want) in [
            (Some("application/json"), Some("application/json")),
            (Some("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), Some("text/html")),
            (Some("text/*;q=0.5, application/json;q=0.4"), Some("text/html")),
            (Some("*/*"), Some("application/json")),
            (Some("text/csv;q=0, text/*"), Some("text/html")),
            (Some("image/png"), None),
            (Some("application/json;q=0"), None),
            (Some("TEXT/HTML"), Some("text/html")),
            (Some("text/html;q=1.5, text/csv"), Some("text/csv")),
            (None, Some("application/json")),
            (Some(""), Some("application/json")),
            (Some("application/*;q=0.2, */*;q=0.1"), Some("application/json")),
            (Some("text/html;level=1;q=0.7, text/csv;q=0.7"), Some("text/html")),
        ] {
            assert_eq!(negotiate_media_type(header, &available), want, "{header:?}");
        }
    }

    #[test]
    fn language() {
        let available = ["en", "en-GB", "fr", "pt-BR"];
        for (header, want) in [
            (Some("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5"), Some("fr")),
            (Some("en-GB"), Some("en-GB")),
            (Some("en-US,en;q=0.9"), Some("en")),
            (Some("pt"), Some("pt-BR")),
            (Some("de"), None),
            (Some("de, *;q=0.1"), Some("en")),
            (Some("en;q=0, *"), Some("fr")),
            (Some("PT-br"), Some("pt-BR")),
            (None, Some("en")),
            (Some("zh-Hant-TW"), None),
        ] {
            assert_eq!(negotiate_language(header, &available), want, "{header:?}");
        }
    }

    #[test]
    fn q_values() {
        for (v, ok) in [("0", true), ("0.", true), ("0.125", true), ("1.000", true), ("1.001", false), ("0.1234", false), (".5", false), ("", false)] {
            assert_eq!(valid_q(v), ok, "{v}");
        }
    }
}
