// SPDX-License-Identifier: Apache-2.0

//! Open-redirect guard for post-login and `next` parameters, hand-parsed.
//! Same-site paths (`/x`, not `//x`) are allowed; absolute URLs only when their
//! http(s) origin exactly matches an allowed origin. Anything else, including
//! `javascript:`, backslashes, control characters and userinfo, falls back.

/// Longest accepted target, in characters.
pub const MAX_LENGTH: usize = 2048;

/// `scheme://host[:port]` (lowercase, default port dropped) for an acceptable
/// absolute http(s) URL, else `None`.
fn origin(url: &str) -> Option<String> {
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host_len = rest.bytes().take_while(|b| b.is_ascii_alphanumeric() || *b == b'.' || *b == b'-').count();
    let host = rest[..host_len].to_ascii_lowercase();
    if host.is_empty() || host.starts_with('.') || host.ends_with('.') || host.contains("..") {
        return None;
    }
    let mut tail = &rest[host_len..];
    let mut port: Option<u32> = None;
    if let Some(after) = tail.strip_prefix(':') {
        let n = after.bytes().take_while(u8::is_ascii_digit).count();
        if !(1..=5).contains(&n) {
            return None;
        }
        let p: u32 = after[..n].parse().ok()?;
        if !(1..=65535).contains(&p) {
            return None;
        }
        port = Some(p);
        tail = &after[n..];
    }
    if !(tail.is_empty() || tail.starts_with(['/', '?', '#'])) {
        return None;
    }
    Some(match port {
        Some(443) if scheme == "https" => format!("{scheme}://{host}"),
        Some(80) if scheme == "http" => format!("{scheme}://{host}"),
        Some(p) => format!("{scheme}://{host}:{p}"),
        None => format!("{scheme}://{host}"),
    })
}

/// Returns `target` when it is safe to redirect to, otherwise `fallback`.
pub fn safe_redirect<'a>(target: &'a str, allowed_origins: &[&str], fallback: &'a str) -> &'a str {
    if target.is_empty() || target.chars().count() > MAX_LENGTH || target.contains('\\') || target.bytes().any(|b| b <= 0x20 || b == 0x7f) {
        return fallback;
    }
    if target.starts_with('/') {
        return if target.starts_with("//") { fallback } else { target };
    }
    match origin(target) {
        Some(o) if allowed_origins.iter().any(|a| origin(a).as_deref() == Some(o.as_str())) => target,
        _ => fallback,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALLOWED: [&str; 2] = ["https://app.example.com", "https://accounts.example.com:8443"];

    #[test]
    fn vectors() {
        for (target, want) in [
            ("/dashboard?tab=1#top", "/dashboard?tab=1#top"),
            ("//evil.com/x", "/"),
            ("/\\evil.com", "/"),
            ("https://app.example.com/settings", "https://app.example.com/settings"),
            ("HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"),
            ("https://app.example.com.evil.com/", "/"),
            ("https://user@app.example.com/", "/"),
            ("http://app.example.com/", "/"),
            ("https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"),
            ("https://accounts.example.com/login", "/"),
            ("javascript:alert(1)", "/"),
            ("/ok path", "/"),
            ("dashboard", "/"),
            ("", "/"),
            ("/\t/evil.com", "/"),
            ("https://app.example.com:99999/", "/"),
        ] {
            assert_eq!(safe_redirect(target, &ALLOWED, "/"), want, "{target}");
        }
    }

    #[test]
    fn edges() {
        let long = format!("/{}", "a".repeat(MAX_LENGTH));
        for target in [long.as_str(), "/a\u{7f}b", "https://.example.com/", "https://app..example.com/", "ftp://app.example.com/", "https://app.example.com:/x", "https://app.example.com:443x"] {
            assert_eq!(safe_redirect(target, &ALLOWED, "/home"), "/home", "{target}");
        }
        assert_eq!(safe_redirect("http://localhost:80/x", &["http://LOCALHOST"], "/"), "http://localhost:80/x");
    }
}
