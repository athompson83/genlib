// SPDX-License-Identifier: Apache-2.0

//! RFC 3986 section 6 normalization for http and https URLs, hand-parsed so
//! results match every other Genlib language: lowercase scheme and host,
//! default port removed, percent-encoding normalized, dot segments removed,
//! empty path `/`, fragment dropped.

use crate::ip_cidr::canonical_ip;
use std::fmt;

/// Rejected URL, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UrlError(pub String);

impl fmt::Display for UrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for UrlError {}

fn err<T>(m: &str) -> Result<T, UrlError> {
    Err(UrlError(m.into()))
}

/// RFC 3986 section 5.2.4.
pub fn remove_dot_segments(path: &str) -> String {
    let mut input = path.to_string();
    let mut out = String::new();
    fn pop_last(out: &mut String) {
        match out.rfind('/') {
            Some(i) => out.truncate(i),
            None => out.clear(),
        }
    }
    while !input.is_empty() {
        if let Some(rest) = input.strip_prefix("../") {
            input = rest.to_string();
        } else if let Some(rest) = input.strip_prefix("./") {
            input = rest.to_string();
        } else if let Some(rest) = input.strip_prefix("/./") {
            input = format!("/{rest}");
        } else if input == "/." {
            input = "/".into();
        } else if let Some(rest) = input.strip_prefix("/../") {
            input = format!("/{rest}");
            pop_last(&mut out);
        } else if input == "/.." {
            input = "/".into();
            pop_last(&mut out);
        } else if input == "." || input == ".." {
            input.clear();
        } else {
            let start = usize::from(input.starts_with('/'));
            let end = input[start..].find('/').map_or(input.len(), |i| start + i);
            out.push_str(&input[..end]);
            input = input[end..].to_string();
        }
    }
    out
}

fn hex_val(c: u8) -> Option<u8> {
    (c as char).to_digit(16).map(|d| d as u8)
}

fn unreserved(c: u8) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, b'-' | b'.' | b'_' | b'~')
}

fn normalize_percent(s: &str) -> Result<String, UrlError> {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'%' {
            out.push(b[i]);
            i += 1;
            continue;
        }
        let (Some(hi), Some(lo)) = (b.get(i + 1).and_then(|&c| hex_val(c)), b.get(i + 2).and_then(|&c| hex_val(c))) else {
            return err("% must be followed by two hex digits");
        };
        let c = hi << 4 | lo;
        if unreserved(c) {
            out.push(c);
        } else {
            out.push(b'%');
            out.extend(b[i + 1..i + 3].to_ascii_uppercase());
        }
        i += 3;
    }
    String::from_utf8(out).map_err(|_| UrlError("invalid UTF-8".into()))
}

/// Normalizes an absolute http(s) URL. Userinfo, whitespace, controls, bad
/// percent-encodings and bad ports are errors.
pub fn normalize_url(text: &str) -> Result<String, UrlError> {
    if text.chars().any(|c| c <= ' ' || c == '\x7f') {
        return err("URL contains whitespace or control characters");
    }
    let Some((scheme, rest)) = text.split_once(':') else { return err("missing scheme") };
    let Some(rest) = rest.strip_prefix("//") else { return err("missing //authority") };
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return err("scheme must be http or https");
    }
    let rest = rest.split('#').next().unwrap_or("");
    let (rest, query) = rest.find('?').map_or((rest, ""), |i| (&rest[..i], &rest[i..]));
    let (authority, path) = rest.find('/').map_or((rest, ""), |i| (&rest[..i], &rest[i..]));
    if authority.contains('@') {
        return err("userinfo is not allowed");
    }
    let (host, port) = if let Some(inner) = authority.strip_prefix('[') {
        let Some(end) = inner.find(']') else { return err("unterminated IPv6 literal") };
        let ip = &inner[..end];
        if ip.is_empty() || !ip.bytes().all(|c| c.is_ascii_hexdigit() || c == b':' || c == b'.') {
            return err("invalid IPv6 literal");
        }
        let canonical = canonical_ip(&ip.to_ascii_lowercase()).map_err(|e| UrlError(e.0))?;
        let tail = &inner[end + 1..];
        let port = if tail.is_empty() {
            None
        } else if let Some(p) = tail.strip_prefix(':') {
            Some(p)
        } else {
            return err("invalid authority");
        };
        (format!("[{canonical}]"), port)
    } else {
        let (host, port) = authority.split_once(':').map_or((authority, None), |(h, p)| (h, Some(p)));
        if host.is_empty() || !host.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-') {
            return err("invalid host");
        }
        (host.to_ascii_lowercase(), port)
    };
    let port = match port {
        Some(p) if !p.is_empty() => {
            if !p.bytes().all(|c| c.is_ascii_digit()) {
                return err("port must be digits");
            }
            let digits = p.trim_start_matches('0');
            let n: u32 = if digits.is_empty() { 0 } else if digits.len() > 5 { u32::MAX } else { digits.parse().unwrap_or(u32::MAX) };
            if n > 65_535 {
                return err("port must be 0-65535");
            }
            if (scheme == "http" && n == 80) || (scheme == "https" && n == 443) {
                String::new()
            } else {
                format!(":{n}")
            }
        }
        _ => String::new(),
    };
    let mut path = remove_dot_segments(&normalize_percent(path)?);
    if path.is_empty() {
        path = "/".into();
    }
    let mut query = normalize_percent(query)?;
    if query == "?" {
        query.clear();
    }
    Ok(format!("{scheme}://{host}{port}{path}{query}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dot_segments() {
        for (input, want) in [
            ("/a/b/c/./../../g", "/a/g"),
            ("mid/content=5/../6", "mid/6"),
            ("/../a", "/a"),
            ("/a/./b/.", "/a/b/"),
            ("/a/b/..", "/a/"),
            (".", ""),
            ("../x", "x"),
            ("/a//b/../c", "/a//c"),
        ] {
            assert_eq!(remove_dot_segments(input), want, "{input}");
        }
    }

    #[test]
    fn normalize() {
        for (input, want) in [
            ("HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f", "http://example.com/~user/b?q=%2F"),
            ("https://example.com", "https://example.com/"),
            ("https://example.com:443/a%2Fb#frag", "https://example.com/a%2Fb"),
            ("http://example.com:8080/A/B/../C?", "http://example.com:8080/A/C"),
            ("https://[2001:DB8::0:1]:8443/x", "https://[2001:db8::1]:8443/x"),
            ("https://example.com/%e2%82%ac", "https://example.com/%E2%82%AC"),
            ("http://example.com:/p", "http://example.com/p"),
            ("https://EXAMPLE.com/a%20b", "https://example.com/a%20b"),
        ] {
            assert_eq!(normalize_url(input).as_deref(), Ok(want), "{input}");
        }
        assert_eq!(normalize_url("http://example.com:0080/%2e%2E/x").as_deref(), Ok("http://example.com/x"));
    }

    #[test]
    fn invalid() {
        for u in [
            "ftp://example.com/", "https://user@example.com/", "https://exa mple.com/", "//example.com/", "https://example.com/%zz", "https://example.com:99999/", "example.com/path", "https://[::g]/",
            "https://example.com:8a/", "https://[::1]x/", "https://example.com/%4", "https://exa_mple.com/", "https://example.com/%",
        ] {
            assert!(normalize_url(u).is_err(), "{u}");
        }
    }
}
