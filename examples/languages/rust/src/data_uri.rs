// SPDX-License-Identifier: Apache-2.0

//! `data:` URLs (RFC 2397 with simplified WHATWG rules). Parsing lowercases the
//! media type (an empty or invalid one becomes text/plain with charset US-ASCII
//! unless a charset is given), percent-decodes the body to bytes (an invalid '%'
//! stays literal) and decodes strict base64 when the header ends in ";base64".
//! Building picks base64 unless the type is textual and the bytes are valid
//! UTF-8. Rust's standard library has no base64, so a small codec is included.

use std::fmt;

/// Invalid data: URL or media type, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DataUriError(pub String);

impl fmt::Display for DataUriError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "data uri: {}", self.0)
    }
}

impl std::error::Error for DataUriError {}

fn err<T>(m: &str) -> Result<T, DataUriError> {
    Err(DataUriError(m.to_string()))
}

/// A parsed data: URL; parameter names are lowercased, values kept as given.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DataUri {
    pub mime: String,
    pub params: Vec<(String, String)>,
    pub base64: bool,
    pub data: Vec<u8>,
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, &b)| acc | (b as u32) << (16 - 8 * i));
        for k in 0..4 {
            if k <= chunk.len() {
                out.push(B64[(n >> (18 - 6 * k) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Decodes unpadded base64 already checked to hold only alphabet characters with length not 1 mod 4.
fn b64_decode(s: &[u8]) -> Vec<u8> {
    let val = |c: u8| B64.iter().position(|&x| x == c).unwrap_or(0) as u32;
    let mut out = Vec::new();
    for chunk in s.chunks(4) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, &c)| acc | val(c) << (18 - 6 * i));
        for k in 0..chunk.len() - 1 {
            out.push((n >> (16 - 8 * k)) as u8);
        }
    }
    out
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c)
}

fn token_end(s: &[char], mut i: usize) -> usize {
    while i < s.len() && is_token_char(s[i]) {
        i += 1;
    }
    i
}

fn is_type_token(s: &str) -> bool {
    let r: Vec<char> = s.chars().collect();
    let i = token_end(&r, 0);
    if i == 0 || i >= r.len() || r[i] != '/' {
        return false;
    }
    let j = token_end(&r, i + 1);
    j > i + 1 && j == r.len()
}

fn pct_decode(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h << 4 | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

/// Decodes a data: URL into its media type, parameters, base64 flag and bytes.
pub fn parse_data_uri(url: &str) -> Result<DataUri, DataUriError> {
    if url.len() < 5 || !url.is_char_boundary(5) || !url[..5].eq_ignore_ascii_case("data:") {
        return err("not a data: URL");
    }
    let Some((header, body)) = url[5..].split_once(',') else { return err("missing comma") };
    let mut header = header.trim();
    let mut is_b64 = false;
    let t = header.trim_end();
    if t.len() >= 6 && t.is_char_boundary(t.len() - 6) && t[t.len() - 6..].eq_ignore_ascii_case("base64") {
        if let Some(before) = t[..t.len() - 6].trim_end().strip_suffix(';') {
            is_b64 = true;
            header = before;
        }
    }
    let mut parts = header.split(';');
    let mut mime = parts.next().unwrap_or("").trim().to_lowercase();
    let mut params: Vec<(String, String)> = Vec::new();
    for p in parts {
        if let Some((k, v)) = p.split_once('=') {
            let k = k.trim().to_lowercase();
            if !k.is_empty() && !params.iter().any(|(n, _)| *n == k) {
                params.push((k, v.trim().to_string()));
            }
        }
    }
    if !is_type_token(&mime) {
        mime = "text/plain".to_string();
        if !params.iter().any(|(n, _)| n == "charset") {
            params.insert(0, ("charset".to_string(), "US-ASCII".to_string()));
        }
    }
    let mut data = pct_decode(body);
    if is_b64 {
        let mut s: Vec<u8> = data.into_iter().filter(|c| !matches!(c, b'\t' | b'\n' | b'\x0c' | b'\r' | b' ')).collect();
        if s.ends_with(b"==") {
            s.truncate(s.len() - 2);
        } else if s.ends_with(b"=") {
            s.truncate(s.len() - 1);
        }
        if s.len() % 4 == 1 || !s.iter().all(|&c| c.is_ascii_alphanumeric() || c == b'+' || c == b'/') {
            return err("invalid base64");
        }
        data = b64_decode(&s);
    }
    Ok(DataUri { mime, params, base64: is_b64, data })
}

/// Checks token/token followed by any number of ";name=value" parameters (optional spaces around ';').
fn valid_media_type(m: &str) -> bool {
    let r: Vec<char> = m.chars().collect();
    let i = token_end(&r, 0);
    if i == 0 || i >= r.len() || r[i] != '/' {
        return false;
    }
    let mut j = token_end(&r, i + 1);
    if j == i + 1 {
        return false;
    }
    while j < r.len() {
        while j < r.len() && r[j].is_whitespace() {
            j += 1;
        }
        if j >= r.len() || r[j] != ';' {
            return false;
        }
        j += 1;
        while j < r.len() && r[j].is_whitespace() {
            j += 1;
        }
        let k = token_end(&r, j);
        if k == j || k >= r.len() || r[k] != '=' {
            return false;
        }
        let mut v = k + 1;
        while v < r.len() && r[v] != ';' && r[v] != ',' && !r[v].is_whitespace() {
            v += 1;
        }
        if v == k + 1 {
            return false;
        }
        j = v;
    }
    true
}

const KEEP: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,";

/// Encodes bytes as a data: URL; `use_base64` of `None` chooses base64 unless the type is textual and the bytes are UTF-8.
pub fn build_data_uri(data: &[u8], mime: &str, use_base64: Option<bool>) -> Result<String, DataUriError> {
    if !valid_media_type(mime) {
        return err("invalid media type");
    }
    let b64 = use_base64.unwrap_or_else(|| {
        let base = mime.split(';').next().unwrap_or("").trim().to_lowercase();
        let textual = base.starts_with("text/")
            || base.ends_with("+json")
            || base.ends_with("+xml")
            || matches!(base.as_str(), "application/json" | "application/xml" | "application/javascript");
        !(textual && std::str::from_utf8(data).is_ok())
    });
    if b64 {
        return Ok(format!("data:{mime};base64,{}", b64_encode(data)));
    }
    let mut out = format!("data:{mime},");
    for &c in data {
        if KEEP.contains(&c) {
            out.push(c as char);
        } else {
            out.push_str(&format!("%{c:02X}"));
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
    fn parse_vectors() {
        let cases: &[(&str, &str, &[(&str, &str)], bool, &[u8])] = &[
            ("data:,Hello%2C%20World!", "text/plain", &[("charset", "US-ASCII")], false, &[0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21]),
            ("data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==", "text/plain", &[], true, &[0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21]),
            ("data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E", "text/html", &[("charset", "utf-8")], false, &[0x3c, 0x68, 0x31, 0x3e, 0x48, 0x69, 0x3c, 0x2f, 0x68, 0x31, 0x3e]),
            ("DATA:image/png;BASE64,iVBORw0KGgo=", "image/png", &[], true, &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            ("data:;base64,SGk", "text/plain", &[("charset", "US-ASCII")], true, &[0x48, 0x69]),
            ("data:text/plain;charset=utf-8;foo=bar,x", "text/plain", &[("charset", "utf-8"), ("foo", "bar")], false, &[0x78]),
            ("data:application/json,%7B%22a%22%3A1%7D", "application/json", &[], false, &[0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d]),
            ("data:bogus,x", "text/plain", &[("charset", "US-ASCII")], false, &[0x78]),
            ("data:text/plain;base64,SG Vs\nbG8=", "text/plain", &[], true, &[0x48, 0x65, 0x6c, 0x6c, 0x6f]),
            ("data:;charset=utf-8,%E2%82%AC", "text/plain", &[("charset", "utf-8")], false, &[0xe2, 0x82, 0xac]),
            ("data:,a%zzb", "text/plain", &[("charset", "US-ASCII")], false, &[0x61, 0x25, 0x7a, 0x7a, 0x62]),
        ];
        for &(url, mime, params, base64, data) in cases {
            let want = DataUri {
                mime: mime.to_string(),
                params: params.iter().map(|&(k, v)| (k.to_string(), v.to_string())).collect(),
                base64,
                data: data.to_vec(),
            };
            assert_eq!(parse_data_uri(url), Ok(want), "{url:?}");
        }
    }

    #[test]
    fn build_vectors() {
        let cases: &[(&[u8], &str, Option<bool>, &str)] = &[
            (&[0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x2c, 0x20, 0x57, 0x6f, 0x72, 0x6c, 0x64, 0x21], "text/plain", None, "data:text/plain,Hello,%20World!"),
            (&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a], "image/png", None, "data:image/png;base64,iVBORw0K"),
            (&[0x7b, 0x22, 0x61, 0x22, 0x3a, 0x31, 0x7d], "application/json", None, "data:application/json,%7B%22a%22:1%7D"),
            (&[0xe2, 0x82, 0xac, 0x20, 0x26, 0x20, 0xc3, 0xbc], "text/plain;charset=utf-8", None, "data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC"),
            (&[0xff, 0xfe], "text/plain", None, "data:text/plain;base64,//4="),
            (&[0x61, 0x62, 0x63], "text/plain", Some(true), "data:text/plain;base64,YWJj"),
            (&[], "application/octet-stream", None, "data:application/octet-stream;base64,"),
            (&[0x61, 0x20, 0x62, 0x2f, 0x63, 0x3f, 0x64], "text/plain", Some(false), "data:text/plain,a%20b/c?d"),
        ];
        for &(data, mime, b64, want) in cases {
            let got = build_data_uri(data, mime, b64).unwrap();
            assert_eq!(got, want);
            assert_eq!(parse_data_uri(&got).unwrap().data, data);
        }
        for n in 0..12u8 {
            let data: Vec<u8> = (0..n).map(|k| k.wrapping_mul(53).wrapping_add(200)).collect();
            let url = build_data_uri(&data, "application/octet-stream", Some(true)).unwrap();
            assert_eq!(parse_data_uri(&url).unwrap().data, data);
        }
    }

    #[test]
    fn invalid_vectors() {
        for url in &["text/plain,x", "data:text/plain", "data:;base64,a", "data:;base64,@@@@", "data:;base64,SGVsbG8=x"] {
            assert!(parse_data_uri(url).is_err(), "{url:?}");
        }
        let bad: &[(&[u8], &str)] = &[(&[0x00], "not a type"), (&[0x00], "text/plain; charset")];
        for &(data, mime) in bad {
            assert!(build_data_uri(data, mime, None).is_err(), "{mime:?}");
        }
    }
}
