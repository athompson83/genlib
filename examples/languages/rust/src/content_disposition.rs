// SPDX-License-Identifier: Apache-2.0

//! `Content-Disposition` (RFC 6266 with RFC 8187 `filename*`) building and
//! parsing. Filenames are sanitized both ways: '/', '\', '"' and control
//! characters become '_', spaces and dots are trimmed from both ends and an
//! empty result becomes "download".

use std::fmt;

/// Malformed Content-Disposition value, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DispositionError(pub String);

impl fmt::Display for DispositionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "content disposition: {}", self.0)
    }
}

impl std::error::Error for DispositionError {}

fn err<T>(m: &str) -> Result<T, DispositionError> {
    Err(DispositionError(m.to_string()))
}

/// A parsed header: lowercased type, sanitized filename (if any) and ordered parameters.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContentDisposition {
    pub kind: String,
    pub filename: Option<String>,
    pub params: Vec<(String, String)>,
}

const ATTR: &str = "!#$&+-.^_`|~";

/// Makes a filename safe to save: separators, quotes and controls become '_', edge spaces and dots are trimmed.
pub fn sanitize_filename(name: &str) -> String {
    let out: String = name.chars().map(|c| if matches!(c, '/' | '\\' | '"') || c < ' ' || c == '\u{7f}' { '_' } else { c }).collect();
    let t = out.trim_matches(|c| c == ' ' || c == '.');
    if t.is_empty() { "download".to_string() } else { t.to_string() }
}

/// Builds an attachment (or inline) header with filename and, for non-ASCII names, an ASCII fallback plus filename*.
pub fn build_content_disposition(filename: &str, inline: bool) -> String {
    let name = sanitize_filename(filename);
    let kind = if inline { "inline" } else { "attachment" };
    let printable = |c: char| (' '..'\u{7f}').contains(&c);
    if name.chars().all(printable) {
        return format!("{kind}; filename=\"{name}\"");
    }
    let fallback: String = name.chars().map(|c| if printable(c) { c } else { '_' }).collect();
    let mut enc = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() || ATTR.contains(c) {
            enc.push(c);
        } else {
            for b in c.to_string().bytes() {
                enc.push_str(&format!("%{b:02X}"));
            }
        }
    }
    format!("{kind}; filename=\"{fallback}\"; filename*=UTF-8''{enc}")
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c)
}

fn decode_ext(v: &str) -> Result<String, DispositionError> {
    let r: Vec<char> = v.chars().collect();
    let cs_char = |c: char| c.is_ascii_alphanumeric() || "!#$&+-^_`{}~".contains(c);
    let i = r.iter().take_while(|&&c| cs_char(c)).count();
    if i == 0 || i >= r.len() || r[i] != '\'' {
        return err("bad extended value");
    }
    let cs: String = r[..i].iter().collect::<String>().to_ascii_lowercase();
    let j = i + 1 + r[i + 1..].iter().take_while(|&&c| c.is_ascii_alphanumeric() || c == '-').count();
    if j >= r.len() || r[j] != '\'' || r[j + 1..].contains(&'\n') || (cs != "utf-8" && cs != "iso-8859-1") {
        return err("bad extended value");
    }
    let rest = &r[j + 1..];
    for (k, &c) in rest.iter().enumerate() {
        if c == '%' && !(k + 2 < rest.len() && rest[k + 1].is_ascii_hexdigit() && rest[k + 2].is_ascii_hexdigit()) {
            return err("bad percent-encoding");
        }
    }
    let src = rest.iter().collect::<String>().into_bytes();
    let mut b = Vec::new();
    let mut k = 0;
    while k < src.len() {
        if src[k] == b'%' {
            let h = |c: u8| (c as char).to_digit(16).unwrap_or(0) as u8;
            b.push(h(src[k + 1]) << 4 | h(src[k + 2]));
            k += 3;
        } else {
            b.push(src[k]);
            k += 1;
        }
    }
    if cs == "utf-8" {
        String::from_utf8(b).or_else(|_| err("invalid UTF-8"))
    } else {
        Ok(b.into_iter().map(char::from).collect())
    }
}

/// Parses a Content-Disposition value; filename* wins over filename and the returned filename is sanitized.
pub fn parse_content_disposition(value: &str) -> Result<ContentDisposition, DispositionError> {
    let s: Vec<char> = value.chars().collect();
    let n = s.len();
    let mut i = s.iter().take_while(|c| c.is_whitespace()).count();
    let start = i;
    while i < n && is_token_char(s[i]) {
        i += 1;
    }
    if i == start {
        return err("missing disposition type");
    }
    let kind = s[start..i].iter().collect::<String>().to_lowercase();
    while i < n && s[i].is_whitespace() {
        i += 1;
    }
    let ws = |i: &mut usize| {
        while *i < n && (s[*i] == ' ' || s[*i] == '\t') {
            *i += 1;
        }
    };
    let mut params: Vec<(String, String)> = Vec::new();
    while i < n {
        if s[i] != ';' {
            return err("expected ;");
        }
        i += 1;
        ws(&mut i);
        if i >= n {
            break;
        }
        let start = i;
        while i < n && is_token_char(s[i]) {
            i += 1;
        }
        if i == start {
            return err("expected parameter");
        }
        let name = s[start..i].iter().collect::<String>().to_lowercase();
        ws(&mut i);
        if i >= n || s[i] != '=' {
            return err("expected =");
        }
        i += 1;
        ws(&mut i);
        let mut val = String::new();
        if i < n && s[i] == '"' {
            i += 1;
            loop {
                if i >= n {
                    return err("unterminated quote");
                }
                let c = s[i];
                if c == '\\' && i + 1 < n {
                    val.push(s[i + 1]);
                    i += 2;
                    continue;
                }
                i += 1;
                if c == '"' {
                    break;
                }
                val.push(c);
            }
        } else {
            while i < n && s[i] != ';' && !s[i].is_whitespace() {
                val.push(s[i]);
                i += 1;
            }
        }
        ws(&mut i);
        if let Some(base) = name.strip_suffix('*') {
            let dec = decode_ext(&val)?;
            match params.iter_mut().find(|(k, _)| k == base) {
                Some(p) => p.1 = dec,
                None => params.push((base.to_string(), dec)),
            }
        } else if !params.iter().any(|(k, _)| *k == name) {
            params.push((name, val));
        }
    }
    let filename = params.iter().find(|(k, _)| k == "filename").map(|(_, v)| sanitize_filename(v));
    Ok(ContentDisposition { kind, filename, params })
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn build_vectors() {
        let cases: &[(&str, bool, &str)] = &[
            ("report.pdf", false, "attachment; filename=\"report.pdf\""),
            ("caf\u{e9}.pdf", false, "attachment; filename=\"caf_.pdf\"; filename*=UTF-8''caf%C3%A9.pdf"),
            ("../etc/passwd", false, "attachment; filename=\"_etc_passwd\""),
            ("a\"b\\c.txt", false, "attachment; filename=\"a_b_c.txt\""),
            ("  .hidden  ", false, "attachment; filename=\"hidden\""),
            ("", false, "attachment; filename=\"download\""),
            ("\u{65e5}\u{672c}\u{8a9e}.txt", true, "inline; filename=\"___.txt\"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt"),
            ("tab\there.csv", false, "attachment; filename=\"tab_here.csv\""),
            ("100% sure+ok.txt", false, "attachment; filename=\"100% sure+ok.txt\""),
        ];
        for &(name, inline, want) in cases {
            assert_eq!(build_content_disposition(name, inline), want);
            assert_eq!(parse_content_disposition(want).unwrap().filename, Some(sanitize_filename(name)));
        }
    }

    #[test]
    fn parse_vectors() {
        assert_eq!(
            parse_content_disposition("attachment; filename=\"x.txt\""),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("x.txt".to_string()), params: vec![("filename".to_string(), "x.txt".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=x.txt"),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("x.txt".to_string()), params: vec![("filename".to_string(), "x.txt".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("INLINE"),
            Ok(ContentDisposition { kind: "inline".to_string(), filename: None, params: vec![] })
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=\"a.txt\"; filename*=UTF-8''%E2%82%AC%20rates.txt"),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("\u{20ac} rates.txt".to_string()), params: vec![("filename".to_string(), "\u{20ac} rates.txt".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("attachment; filename*=iso-8859-1'en'%A3%20rates.txt"),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("\u{a3} rates.txt".to_string()), params: vec![("filename".to_string(), "\u{a3} rates.txt".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=\"..\\\\..\\\\evil.exe\""),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("_.._evil.exe".to_string()), params: vec![("filename".to_string(), "..\\..\\evil.exe".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("attachment; filename=\"\\\"quoted\\\".txt\"; size=100"),
            Ok(ContentDisposition { kind: "attachment".to_string(), filename: Some("_quoted_.txt".to_string()), params: vec![("filename".to_string(), "\"quoted\".txt".to_string()), ("size".to_string(), "100".to_string())] })
        );
        assert_eq!(
            parse_content_disposition("form-data; name=\"file\"; filename=\"photo.jpg\""),
            Ok(ContentDisposition { kind: "form-data".to_string(), filename: Some("photo.jpg".to_string()), params: vec![("name".to_string(), "file".to_string()), ("filename".to_string(), "photo.jpg".to_string())] })
        );
    }

    #[test]
    fn invalid_vectors() {
        for s in &["; filename=x", "attachment; filename=\"open", "attachment; filename*=UTF-8''%G0", "attachment filename=x"] {
            assert!(parse_content_disposition(s).is_err(), "{s:?}");
        }
        for (a, b) in [("../../x", "_.._x"), ("...", "download"), ("a\u{7f}b", "a_b")] {
            assert_eq!(sanitize_filename(a), b);
        }
    }
}
