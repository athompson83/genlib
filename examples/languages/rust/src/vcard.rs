// SPDX-License-Identifier: Apache-2.0

//! RFC 6350 vCard 4.0 export with escaped text values, validated email,
//! telephone, URL and TYPE values, and UTF-8-safe 75-octet line folding.
//! Output lines end with CRLF. Standard library only.

use std::fmt;

/// Blank FN, invalid value or control character.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VcardError(pub String);

impl fmt::Display for VcardError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for VcardError {}

fn err<T>(m: &str) -> Result<T, VcardError> {
    Err(VcardError(m.into()))
}

/// Structured N property; empty components are written empty.
#[derive(Clone, Debug, Default)]
pub struct Name<'a> {
    pub family: &'a str,
    pub given: &'a str,
    pub additional: &'a str,
    pub prefix: &'a str,
    pub suffix: &'a str,
}

/// Email or telephone value with an optional TYPE (`[a-z][a-z0-9-]*`).
#[derive(Clone, Debug, Default)]
pub struct Typed<'a> {
    pub value: &'a str,
    pub kind: Option<&'a str>,
}

/// Structured ADR property with an optional TYPE.
#[derive(Clone, Debug, Default)]
pub struct Address<'a> {
    pub kind: Option<&'a str>,
    pub po_box: &'a str,
    pub extended: &'a str,
    pub street: &'a str,
    pub locality: &'a str,
    pub region: &'a str,
    pub postal_code: &'a str,
    pub country: &'a str,
}

/// The exported contact; `fn_` is required, empty optional fields are omitted.
#[derive(Clone, Debug, Default)]
pub struct Contact<'a> {
    pub fn_: &'a str,
    pub n: Option<Name<'a>>,
    pub org: &'a str,
    pub title: &'a str,
    pub emails: Vec<Typed<'a>>,
    pub phones: Vec<Typed<'a>>,
    pub address: Option<Address<'a>>,
    pub urls: Vec<&'a str>,
    pub note: &'a str,
    pub uid: &'a str,
}

fn escape(s: &str) -> Result<String, VcardError> {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            ',' => out.push_str("\\,"),
            ';' => out.push_str("\\;"),
            '\n' => out.push_str("\\n"),
            c if c < '\u{20}' || c == '\u{7f}' => return err("control character in text value"),
            c => out.push(c),
        }
    }
    Ok(out)
}

fn join_escaped(parts: &[&str]) -> Result<String, VcardError> {
    Ok(parts.iter().map(|p| escape(p)).collect::<Result<Vec<_>, _>>()?.join(";"))
}

fn type_param(kind: Option<&str>) -> Result<String, VcardError> {
    let Some(t) = kind else { return Ok(String::new()) };
    let ok = !t.is_empty()
        && t.bytes().enumerate().all(|(i, c)| c.is_ascii_lowercase() || (i > 0 && (c.is_ascii_digit() || c == b'-')));
    if !ok {
        return err("TYPE must match [a-z][a-z0-9-]*");
    }
    Ok(format!(";TYPE={t}"))
}

fn valid_email(s: &str) -> bool {
    match s.split_once('@') {
        Some((l, d)) => !l.is_empty() && !d.is_empty() && !d.contains('@') && !s.chars().any(char::is_whitespace),
        None => false,
    }
}

fn valid_phone(s: &str) -> bool {
    let s = s.strip_prefix('+').unwrap_or(s).as_bytes();
    (2..=31).contains(&s.len()) && s[0].is_ascii_digit() && s[1..].iter().all(|c| b"0123456789 ().-".contains(c))
}

fn valid_url(s: &str) -> bool {
    let rest = s.strip_prefix("https://").or_else(|| s.strip_prefix("http://")).unwrap_or("");
    !rest.is_empty() && !rest.chars().any(char::is_whitespace)
}

/// Appends `line` folded at 75 octets (74 after the leading space), never
/// splitting a UTF-8 character, terminated by CRLF.
fn push_folded(out: &mut String, line: &str) {
    let (mut used, mut limit) = (0, 75);
    for c in line.chars() {
        if used + c.len_utf8() > limit {
            out.push_str("\r\n ");
            used = 0;
            limit = 74;
        }
        out.push(c);
        used += c.len_utf8();
    }
    out.push_str("\r\n");
}

/// Builds the vCard, or fails for a blank FN, an invalid email, telephone,
/// URL or TYPE value, or a control character other than newline in text.
pub fn build_vcard(c: &Contact) -> Result<String, VcardError> {
    if c.fn_.trim().is_empty() {
        return err("FN is required");
    }
    let mut lines = vec!["BEGIN:VCARD".to_string(), "VERSION:4.0".to_string(), format!("FN:{}", escape(c.fn_)?)];
    if let Some(n) = &c.n {
        lines.push(format!("N:{}", join_escaped(&[n.family, n.given, n.additional, n.prefix, n.suffix])?));
    }
    if !c.org.is_empty() {
        lines.push(format!("ORG:{}", escape(c.org)?));
    }
    if !c.title.is_empty() {
        lines.push(format!("TITLE:{}", escape(c.title)?));
    }
    for e in &c.emails {
        if !valid_email(e.value) {
            return err("invalid email address");
        }
        lines.push(format!("EMAIL{}:{}", type_param(e.kind)?, escape(e.value)?));
    }
    for p in &c.phones {
        if !valid_phone(p.value) {
            return err("invalid telephone number");
        }
        lines.push(format!("TEL{}:{}", type_param(p.kind)?, p.value));
    }
    if let Some(a) = &c.address {
        let v = join_escaped(&[a.po_box, a.extended, a.street, a.locality, a.region, a.postal_code, a.country])?;
        lines.push(format!("ADR{}:{v}", type_param(a.kind)?));
    }
    for u in &c.urls {
        if !valid_url(u) {
            return err("URL must be http(s) without whitespace");
        }
        lines.push(format!("URL:{u}"));
    }
    if !c.note.is_empty() {
        lines.push(format!("NOTE:{}", escape(c.note)?));
    }
    if !c.uid.is_empty() {
        lines.push(format!("UID:{}", escape(c.uid)?));
    }
    lines.push("END:VCARD".into());
    let mut out = String::new();
    for l in &lines {
        push_folded(&mut out, l);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cards() {
        let ada = Contact {
            fn_: "Ada Lovelace",
            n: Some(Name { family: "Lovelace", given: "Ada", prefix: "Countess", ..Default::default() }),
            org: "Analytical Engines, Ltd.",
            title: "Programmer",
            emails: vec![Typed { value: "ada@example.com", kind: Some("work") }],
            phones: vec![Typed { value: "+44 20 7946 0000", kind: Some("cell") }],
            address: Some(Address { kind: Some("home"), street: "12 St. James's Sq", locality: "London", postal_code: "SW1Y 4LB", country: "United Kingdom", ..Default::default() }),
            urls: vec!["https://example.com/ada"],
            note: "First line\nSecond; with, punctuation \\ backslash",
            uid: "urn:uuid:01a0c450-6c7b-7102-8304-05060708090a",
        };
        let long = "é".repeat(60);
        let folded = format!("BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:{}\r\n {}\r\nEND:VCARD\r\n", "é".repeat(35), "é".repeat(25));
        for (c, want) in [
            (ada, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James's Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n"),
            (Contact { fn_: "Zoë Ångström", ..Default::default() }, "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zoë Ångström\r\nEND:VCARD\r\n"),
            (Contact { fn_: "Long Note", note: &long, ..Default::default() }, &folded),
        ] {
            assert_eq!(build_vcard(&c).as_deref(), Ok(want), "{}", c.fn_);
        }
    }

    #[test]
    fn invalid() {
        let d = Contact::default;
        for c in [
            Contact { fn_: "", ..d() },
            Contact { fn_: "   ", ..d() },
            Contact { fn_: "A", emails: vec![Typed { value: "not an email", kind: None }], ..d() },
            Contact { fn_: "A", phones: vec![Typed { value: "call me", kind: None }], ..d() },
            Contact { fn_: "A", urls: vec!["javascript:alert(1)"], ..d() },
            Contact { fn_: "A", emails: vec![Typed { value: "a@b.c", kind: Some("Work") }], ..d() },
            Contact { fn_: "Tab\there", ..d() },
        ] {
            assert!(build_vcard(&c).is_err(), "{c:?}");
        }
    }
}
