// SPDX-License-Identifier: Apache-2.0

//! HTTP `Link` header (RFC 8288) parsing and formatting. Commas inside `<...>`
//! and quoted strings do not split; parameter names are lowercased; RFC 8187
//! `name*` values (UTF-8 or ISO-8859-1) win over the plain form and are stored
//! without '*'; otherwise the first occurrence wins; rel is lowercased with
//! whitespace collapsed.

use std::fmt;

/// Malformed Link header, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LinkHeaderError(pub String);

impl fmt::Display for LinkHeaderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "link header: {}", self.0)
    }
}

impl std::error::Error for LinkHeaderError {}

fn err<T>(m: &str) -> Result<T, LinkHeaderError> {
    Err(LinkHeaderError(m.to_string()))
}

/// One link-value: a target URI and its ordered parameters.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Link {
    pub uri: String,
    pub params: Vec<(String, String)>,
}

impl Link {
    /// Returns the value of parameter `name`, if present.
    pub fn get(&self, name: &str) -> Option<&str> {
        self.params.iter().find(|(n, _)| n == name).map(|(_, v)| v.as_str())
    }
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || "!#$%&'*+-.^_`|~".contains(c)
}

/// Decodes an RFC 8187 ext-value: charset'lang'pct-encoded.
fn decode_ext(v: &str) -> Result<String, LinkHeaderError> {
    let r: Vec<char> = v.chars().collect();
    let cs_char = |c: char| c.is_ascii_alphanumeric() || "!#$&+-^_`{}~".contains(c);
    let i = r.iter().take_while(|&&c| cs_char(c)).count();
    if i == 0 || i >= r.len() || r[i] != '\'' {
        return err("bad extended value");
    }
    let cs: String = r[..i].iter().collect::<String>().to_ascii_lowercase();
    let j = i + 1 + r[i + 1..].iter().take_while(|&&c| c.is_ascii_alphanumeric() || c == '-').count();
    if j >= r.len() || r[j] != '\'' || r[j + 1..].contains(&'\n') {
        return err("bad extended value");
    }
    if cs != "utf-8" && cs != "iso-8859-1" {
        return err("unsupported charset");
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

fn set_param(ps: &mut Vec<(String, String)>, name: String, value: String) {
    match ps.iter_mut().find(|(n, _)| *n == name) {
        Some(p) => p.1 = value,
        None => ps.push((name, value)),
    }
}

/// Splits a Link header value into links.
pub fn parse_link_header(value: &str) -> Result<Vec<Link>, LinkHeaderError> {
    let s: Vec<char> = value.chars().collect();
    let n = s.len();
    let mut i = 0;
    let mut links = Vec::new();
    let ws = |i: &mut usize| {
        while *i < n && (s[*i] == ' ' || s[*i] == '\t') {
            *i += 1;
        }
    };
    loop {
        ws(&mut i);
        if i >= n {
            break;
        }
        if s[i] == ',' {
            i += 1;
            continue;
        }
        if s[i] != '<' {
            return err("expected <");
        }
        let Some(end) = s[i..].iter().position(|&c| c == '>').map(|p| p + i) else { return err("unterminated <") };
        let uri: String = s[i + 1..end].iter().collect();
        i = end + 1;
        let mut params: Vec<(String, String)> = Vec::new();
        let mut ext: Vec<String> = Vec::new();
        loop {
            ws(&mut i);
            if i >= n || s[i] == ',' {
                break;
            }
            if s[i] != ';' {
                return err("expected ;");
            }
            i += 1;
            ws(&mut i);
            let start = i;
            while i < n && is_token_char(s[i]) {
                i += 1;
            }
            if i == start {
                return err("expected parameter name");
            }
            let name = s[start..i].iter().collect::<String>().to_lowercase();
            ws(&mut i);
            let mut val = String::new();
            if i < n && s[i] == '=' {
                i += 1;
                ws(&mut i);
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
                    while i < n && s[i] != ',' && s[i] != ';' && !s[i].is_whitespace() {
                        val.push(s[i]);
                        i += 1;
                    }
                }
            }
            if let Some(base) = name.strip_suffix('*') {
                let dec = decode_ext(&val)?;
                ext.push(base.to_string());
                set_param(&mut params, base.to_string(), dec);
            } else if !ext.contains(&name) && !params.iter().any(|(k, _)| *k == name) {
                params.push((name, val));
            }
        }
        for p in params.iter_mut().filter(|p| p.0 == "rel") {
            p.1 = p.1.to_lowercase().split_whitespace().collect::<Vec<_>>().join(" ");
        }
        links.push(Link { uri, params });
    }
    Ok(links)
}

/// Returns the first link whose rel list contains `rel` (case-insensitive).
pub fn find_rel<'a>(links: &'a [Link], rel: &str) -> Option<&'a Link> {
    let want = rel.to_lowercase();
    links.iter().find(|l| l.get("rel").unwrap_or("").split_whitespace().any(|r| r == want))
}

fn is_token(v: &str) -> bool {
    !v.is_empty() && v.chars().all(is_token_char)
}

/// Renders links as a Link header value; rel is always quoted and non-printable-ASCII values use the RFC 8187 name*=UTF-8 form.
pub fn format_link_header(links: &[Link]) -> String {
    const ATTR: &str = "!#$&+-.^_`|~";
    let mut out = Vec::new();
    for l in links {
        let mut parts = vec![format!("<{}>", l.uri)];
        for (k, v) in &l.params {
            if v.chars().any(|c| !(' '..='\u{7e}').contains(&c)) {
                let mut enc = format!("{k}*=UTF-8''");
                for c in v.chars() {
                    if c.is_ascii_alphanumeric() || ATTR.contains(c) {
                        enc.push(c);
                    } else {
                        for b in c.to_string().bytes() {
                            enc.push_str(&format!("%{b:02X}"));
                        }
                    }
                }
                parts.push(enc);
            } else if is_token(v) && k != "rel" {
                parts.push(format!("{k}={v}"));
            } else {
                parts.push(format!("{k}=\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\"")));
            }
        }
        out.push(parts.join("; "));
    }
    out.join(", ")
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn parse_vectors() {
        assert_eq!(parse_link_header("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), Ok(vec![Link { uri: "https://api.test/items?page=2".to_string(), params: vec![("rel".to_string(), "next".to_string())] }, Link { uri: "https://api.test/items?page=9".to_string(), params: vec![("rel".to_string(), "last".to_string())] }]));
        assert_eq!(parse_link_header("<https://x/?a=1,2>; rel=next; title=\"a, \\\"b\\\"; c\""), Ok(vec![Link { uri: "https://x/?a=1,2".to_string(), params: vec![("rel".to_string(), "next".to_string()), ("title".to_string(), "a, \"b\"; c".to_string())] }]));
        assert_eq!(parse_link_header("</TheBook/chapter2>; rel=\"previous\"; title*=UTF-8'de'letztes%20Kapitel, </TheBook/chapter4>; rel=\"next\"; title*=UTF-8'de'n%c3%a4chstes%20Kapitel"), Ok(vec![Link { uri: "/TheBook/chapter2".to_string(), params: vec![("rel".to_string(), "previous".to_string()), ("title".to_string(), "letztes Kapitel".to_string())] }, Link { uri: "/TheBook/chapter4".to_string(), params: vec![("rel".to_string(), "next".to_string()), ("title".to_string(), "n\u{e4}chstes Kapitel".to_string())] }]));
        assert_eq!(parse_link_header("<http://example.org/>; REL=\"Start Index\"; anchor=\"#x\"; rel=ignored; hreflang=en"), Ok(vec![Link { uri: "http://example.org/".to_string(), params: vec![("rel".to_string(), "start index".to_string()), ("anchor".to_string(), "#x".to_string()), ("hreflang".to_string(), "en".to_string())] }]));
        assert_eq!(parse_link_header("<a>;rel=x;crossorigin"), Ok(vec![Link { uri: "a".to_string(), params: vec![("rel".to_string(), "x".to_string()), ("crossorigin".to_string(), "".to_string())] }]));
        assert_eq!(parse_link_header(""), Ok(vec![]));
        assert_eq!(parse_link_header("  ,  <a>; rel=x ,"), Ok(vec![Link { uri: "a".to_string(), params: vec![("rel".to_string(), "x".to_string())] }]));
    }

    #[test]
    fn rel_vectors() {
        assert_eq!(find_rel(&parse_link_header("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\"").unwrap(), "LAST").map(|l| l.uri.as_str()), Some("https://api.test/items?page=9"));
        assert_eq!(find_rel(&parse_link_header("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\"").unwrap(), "prev").map(|l| l.uri.as_str()), None);
    }

    #[test]
    fn format_vectors() {
        let links = vec![Link { uri: "/a".to_string(), params: vec![("rel".to_string(), "next".to_string())] }];
        assert_eq!(format_link_header(&links), "</a>; rel=\"next\"");
        assert_eq!(parse_link_header("</a>; rel=\"next\""), Ok(links));
        let links = vec![Link { uri: "/b".to_string(), params: vec![("rel".to_string(), "prev".to_string()), ("title".to_string(), "Page \"1\"".to_string()), ("type".to_string(), "text/html".to_string())] }, Link { uri: "/c".to_string(), params: vec![("rel".to_string(), "next".to_string()), ("title".to_string(), "\u{20ac} x".to_string())] }];
        assert_eq!(format_link_header(&links), "</b>; rel=\"prev\"; title=\"Page \\\"1\\\"\"; type=\"text/html\", </c>; rel=\"next\"; title*=UTF-8''%E2%82%AC%20x");
        assert_eq!(parse_link_header("</b>; rel=\"prev\"; title=\"Page \\\"1\\\"\"; type=\"text/html\", </c>; rel=\"next\"; title*=UTF-8''%E2%82%AC%20x"), Ok(links));
    }

    #[test]
    fn invalid_vectors() {
        for s in &["https://x; rel=next", "<https://x", "<a>; title=\"x", "<a> rel=x", "<a>; title*=UTF-8''%zz", "<a>; title*=KOI8-R''x"] {
            assert!(parse_link_header(s).is_err(), "{s:?}");
        }
    }
}
