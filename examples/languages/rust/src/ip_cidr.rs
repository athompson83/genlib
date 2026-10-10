// SPDX-License-Identifier: Apache-2.0

//! Hand-parsed IPv4/IPv6 addresses (identical results on every platform),
//! RFC 5952 canonical text, CIDR membership and an SSRF public-address check.
//!
//! SSRF use: resolve the hostname yourself, check EVERY resolved address with
//! [`is_public_ip`], then connect to that checked address (no second DNS
//! lookup), and repeat the check after every redirect.

use std::fmt;

/// Malformed address or CIDR, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IpError(pub String);

impl fmt::Display for IpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for IpError {}

fn err<T>(m: &str) -> Result<T, IpError> {
    Err(IpError(m.into()))
}

fn decimal(p: &str, max: u32) -> Option<u32> {
    if p.is_empty() || p.len() > 3 || (p.len() > 1 && p.starts_with('0')) || !p.bytes().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let n: u32 = p.parse().ok()?;
    if n <= max {
        Some(n)
    } else {
        None
    }
}

fn parse_v4(s: &str) -> Result<Vec<u8>, IpError> {
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 4 {
        return err("IPv4 needs four decimal parts");
    }
    parts.iter().map(|p| decimal(p, 255).map(|n| n as u8).ok_or_else(|| IpError("invalid IPv4 part".into()))).collect()
}

fn hex_groups(x: &str) -> Result<Vec<u16>, IpError> {
    if x.is_empty() {
        return Ok(Vec::new());
    }
    x.split(':')
        .map(|h| {
            if h.is_empty() || h.len() > 4 || !h.bytes().all(|c| c.is_ascii_hexdigit()) {
                return err("invalid IPv6 group");
            }
            u16::from_str_radix(h, 16).map_err(|_| IpError("invalid IPv6 group".into()))
        })
        .collect()
}

fn parse_v6(text: &str) -> Result<Vec<u8>, IpError> {
    if text.matches("::").count() > 1 || text.is_empty() || !text.bytes().all(|c| c.is_ascii_hexdigit() || c == b':' || c == b'.') {
        return err("invalid IPv6 address");
    }
    let mut s = text;
    let mut tail: Vec<u8> = Vec::new();
    if s.contains('.') {
        let i = s.rfind(':').unwrap_or(0);
        tail = parse_v4(&s[i + 1..])?;
        s = if i >= 1 && s.as_bytes()[i - 1] == b':' { &s[..i + 1] } else { &s[..i] };
    }
    let need = if tail.is_empty() { 8 } else { 6 };
    let groups = if let Some((a, b)) = s.split_once("::") {
        let (ga, gb) = (hex_groups(a)?, hex_groups(b)?);
        if ga.len() + gb.len() > need - 1 {
            return err("too many IPv6 groups");
        }
        let mut g = ga.clone();
        g.resize(need - gb.len(), 0);
        g.extend(gb);
        g
    } else {
        let g = hex_groups(s)?;
        if g.len() != need {
            return err("wrong number of IPv6 groups");
        }
        g
    };
    let mut out: Vec<u8> = groups.iter().flat_map(|g| g.to_be_bytes()).collect();
    out.extend(tail);
    Ok(out)
}

/// Parses IPv4 (4 bytes) or IPv6 (16 bytes) text. Zone ids, brackets,
/// whitespace and CIDR suffixes are rejected.
pub fn parse_ip(text: &str) -> Result<Vec<u8>, IpError> {
    if text.contains(':') {
        parse_v6(text)
    } else {
        parse_v4(text)
    }
}

fn is_mapped(b: &[u8]) -> bool {
    b.len() == 16 && b[..10].iter().all(|&x| x == 0) && b[10] == 0xff && b[11] == 0xff
}

fn v4_text(b: &[u8]) -> String {
    format!("{}.{}.{}.{}", b[0], b[1], b[2], b[3])
}

/// Formats 4 or 16 bytes as canonical text (RFC 5952 for IPv6).
pub fn format_ip(b: &[u8]) -> String {
    if b.len() == 4 {
        return v4_text(b);
    }
    if is_mapped(b) {
        return format!("::ffff:{}", v4_text(&b[12..]));
    }
    let g: Vec<u16> = b.chunks(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
    let (mut best, mut best_len, mut i) = (None, 1, 0);
    while i < 8 {
        if g[i] != 0 {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < 8 && g[j] == 0 {
            j += 1;
        }
        if j - i > best_len {
            best = Some(i);
            best_len = j - i;
        }
        i = j;
    }
    let hex = |s: &[u16]| s.iter().map(|x| format!("{x:x}")).collect::<Vec<_>>().join(":");
    match best {
        None => hex(&g),
        Some(start) => format!("{}::{}", hex(&g[..start]), hex(&g[start + best_len..])),
    }
}

/// Canonical text of an IP address.
pub fn canonical_ip(text: &str) -> Result<String, IpError> {
    parse_ip(text).map(|b| format_ip(&b))
}

fn parse_cidr(cidr: &str) -> Result<(Vec<u8>, usize), IpError> {
    if cidr.matches('/').count() != 1 {
        return err("CIDR must be address/prefix");
    }
    let (a, p) = cidr.split_once('/').unwrap_or_default();
    let b = parse_ip(a)?;
    let bits = b.len() * 8;
    let p = match decimal(p, bits as u32) {
        Some(p) => p as usize,
        None => return err("invalid prefix length"),
    };
    if (p..bits).any(|bit| b[bit / 8] & (0x80 >> (bit % 8)) != 0) {
        return err("CIDR has host bits set");
    }
    Ok((b, p))
}

fn prefix_equal(a: &[u8], b: &[u8], p: usize) -> bool {
    (0..p).all(|bit| {
        let m = 0x80u8 >> (bit % 8);
        a[bit / 8] & m == b[bit / 8] & m
    })
}

/// Whether `ip` lies inside `cidr`. Different families never match; malformed
/// CIDRs (including host bits set) and malformed addresses are errors.
pub fn cidr_contains(cidr: &str, ip: &str) -> Result<bool, IpError> {
    let (b, p) = parse_cidr(cidr)?;
    let x = parse_ip(ip)?;
    Ok(x.len() == b.len() && prefix_equal(&x, &b, p))
}

const V4_SPECIAL: [&str; 15] = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4"];
const V6_SPECIAL: [&str; 9] = ["::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8"];
const NAT64: [u8; 12] = [0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0];

/// Whether `ip` is outside every special-purpose range. IPv4-mapped
/// (::ffff:0:0/96) and NAT64 (64:ff9b::/96) addresses are judged by their
/// embedded IPv4. Unparseable input is not public.
pub fn is_public_ip(ip: &str) -> bool {
    let Ok(mut b) = parse_ip(ip) else { return false };
    if b.len() == 16 && (is_mapped(&b) || b[..12] == NAT64) {
        b = b[12..].to_vec();
    }
    let list: &[&str] = if b.len() == 4 { &V4_SPECIAL } else { &V6_SPECIAL };
    !list.iter().any(|c| {
        let (s, p) = parse_cidr(c).expect("built-in CIDR");
        prefix_equal(&b, &s, p)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical() {
        for (input, want) in [
            ("192.168.1.1", "192.168.1.1"),
            ("2001:DB8:0:0:0:0:0:1", "2001:db8::1"),
            ("2001:db8::0:1", "2001:db8::1"),
            ("::", "::"),
            ("::1", "::1"),
            ("2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"),
            ("2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"),
            ("fe80::1:0:0:0", "fe80::1:0:0:0"),
            ("::ffff:192.0.2.128", "::ffff:192.0.2.128"),
            ("::ffff:c000:280", "::ffff:192.0.2.128"),
            ("1:0:0:2:0:0:0:3", "1:0:0:2::3"),
            ("64:ff9b::198.51.100.7", "64:ff9b::c633:6407"),
        ] {
            assert_eq!(canonical_ip(input).as_deref(), Ok(want), "{input}");
        }
    }

    #[test]
    fn invalid() {
        for s in ["256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1:2:3:4:5:6:7:8:9", "1::2::3", "::g", "fe80::1%eth0", "[::1]", "", " 1.2.3.4", "1.2.3.4/24", "12345::"] {
            assert!(parse_ip(s).is_err(), "{s}");
        }
    }

    #[test]
    fn contains() {
        for (cidr, ip, want) in [
            ("10.0.0.0/8", "10.255.1.2", true),
            ("10.0.0.0/8", "11.0.0.1", false),
            ("192.168.1.0/24", "192.168.1.255", true),
            ("0.0.0.0/0", "8.8.8.8", true),
            ("2001:db8::/32", "2001:db8:ffff::1", true),
            ("2001:db8::/32", "2001:db9::1", false),
            ("10.0.0.0/8", "::ffff:10.0.0.1", false),
            ("::/0", "::1", true),
            ("192.168.1.1/32", "192.168.1.1", true),
        ] {
            assert_eq!(cidr_contains(cidr, ip), Ok(want), "{cidr} {ip}");
        }
        for cidr in ["10.0.0.1/8", "10.0.0.0/33", "10.0.0.0", "10.0.0.0/08", "2001:db8::/129"] {
            assert!(cidr_contains(cidr, "10.0.0.1").is_err(), "{cidr}");
        }
    }

    #[test]
    fn public() {
        for (ip, want) in [
            ("8.8.8.8", true), ("10.1.2.3", false), ("127.0.0.1", false), ("169.254.169.254", false),
            ("100.64.0.1", false), ("172.31.255.255", false), ("172.32.0.1", true), ("192.168.0.10", false),
            ("0.0.0.0", false), ("255.255.255.255", false), ("224.0.0.1", false), ("2606:4700:4700::1111", true),
            ("::1", false), ("fd00::1", false), ("fe80::1", false), ("::ffff:127.0.0.1", false),
            ("::ffff:8.8.8.8", true), ("64:ff9b::a00:1", false), ("2001:db8::1", false), ("ff02::1", false),
        ] {
            assert_eq!(is_public_ip(ip), want, "{ip}");
        }
        assert!(!is_public_ip("not an ip"));
    }
}
