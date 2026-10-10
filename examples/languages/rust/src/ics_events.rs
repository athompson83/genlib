// SPDX-License-Identifier: Apache-2.0

//! RFC 5545 iCalendar (VCALENDAR/VEVENT) writer with TEXT escaping and
//! UTF-8-safe 75-octet line folding. Standard library only.

use std::fmt;

/// Validation error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IcsError(pub String);

impl fmt::Display for IcsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for IcsError {}

fn err<T>(message: impl Into<String>) -> Result<T, IcsError> {
    Err(IcsError(message.into()))
}

/// One event. Times are UTC `YYYY-MM-DDTHH:MM:SSZ` or dates `YYYY-MM-DD`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct IcsEvent<'a> {
    pub uid: &'a str,
    pub dtstamp: &'a str,
    pub start: &'a str,
    pub end: &'a str,
    pub summary: &'a str,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub url: Option<&'a str>,
}

#[derive(PartialEq, Eq)]
enum Kind {
    Utc,
    Date,
}

fn num(s: &str, from: usize, to: usize) -> Option<u32> {
    let part = s.get(from..to)?;
    part.bytes().all(|b| b.is_ascii_digit()).then(|| part.parse().ok())?
}

fn valid_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 10
        && b[4] == b'-'
        && b[7] == b'-'
        && num(s, 0, 4).is_some()
        && matches!(num(s, 5, 7), Some(1..=12))
        && matches!(num(s, 8, 10), Some(1..=31))
}

/// Returns the value kind and its compact iCalendar form.
fn parse_time(s: &str, field: &str) -> Result<(Kind, String), IcsError> {
    let b = s.as_bytes();
    if b.len() == 10 && valid_date(s) {
        return Ok((Kind::Date, s.replace('-', "")));
    }
    if b.len() == 20
        && valid_date(s)
        && b[10] == b'T'
        && b[13] == b':'
        && b[16] == b':'
        && b[19] == b'Z'
        && matches!(num(s, 11, 13), Some(0..=23))
        && matches!(num(s, 14, 16), Some(0..=59))
        && matches!(num(s, 17, 19), Some(0..=59))
    {
        return Ok((Kind::Utc, s.replace(['-', ':'], "")));
    }
    err(format!("{field} must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD: {s:?}"))
}

/// RFC 5545 TEXT escaping: backslash, semicolon, comma and line breaks.
pub fn escape_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => out.push_str("\\\\"),
            ';' => out.push_str("\\;"),
            ',' => out.push_str("\\,"),
            '\n' => out.push_str("\\n"),
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push_str("\\n");
            }
            _ => out.push(c),
        }
    }
    out
}

/// Appends `line` folded at 75 octets (74 after the leading space), never
/// splitting a UTF-8 character, terminated by CRLF.
fn push_folded(out: &mut String, line: &str) {
    let mut used = 0;
    let mut limit = 75;
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

fn valid_url(url: &str) -> bool {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"));
    match rest {
        Some(r) => {
            let host_end = r.find(['/', '?', '#']).unwrap_or(r.len());
            host_end > 0 && !url.chars().any(|c| c.is_whitespace() || c.is_control())
        }
        None => false,
    }
}

fn check_text(value: &str, field: &str) -> Result<(), IcsError> {
    if value.chars().any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t') {
        return err(format!("{field} contains a control character"));
    }
    Ok(())
}

/// Builds a VCALENDAR document with CRLF line ends.
pub fn ics_calendar(events: &[IcsEvent<'_>], prod_id: &str) -> Result<String, IcsError> {
    if prod_id.is_empty() {
        return err("prodId must not be empty");
    }
    check_text(prod_id, "prodId")?;
    let mut out = String::new();
    for line in ["BEGIN:VCALENDAR", "VERSION:2.0", &format!("PRODID:{}", escape_text(prod_id))] {
        push_folded(&mut out, line);
    }
    push_folded(&mut out, "CALSCALE:GREGORIAN");
    push_folded(&mut out, "METHOD:PUBLISH");
    for (i, e) in events.iter().enumerate() {
        if e.uid.is_empty() {
            return err(format!("event {i}: uid must not be empty"));
        }
        if e.summary.is_empty() {
            return err(format!("event {i}: summary must not be empty"));
        }
        for (name, value) in [("uid", Some(e.uid)), ("summary", Some(e.summary)), ("description", e.description), ("location", e.location)] {
            if let Some(v) = value {
                check_text(v, name)?;
            }
        }
        let (stamp_kind, stamp) = parse_time(e.dtstamp, "dtstamp")?;
        if stamp_kind != Kind::Utc {
            return err(format!("event {i}: dtstamp must be a UTC date-time"));
        }
        let (start_kind, start) = parse_time(e.start, "start")?;
        let (end_kind, end) = parse_time(e.end, "end")?;
        if start_kind != end_kind {
            return err(format!("event {i}: start and end must both be dates or both be UTC date-times"));
        }
        if end <= start {
            return err(format!("event {i}: end must be after start"));
        }
        if let Some(url) = e.url {
            if !valid_url(url) {
                return err(format!("event {i}: url must be an absolute http(s) URL"));
            }
        }
        let param = if start_kind == Kind::Date { ";VALUE=DATE" } else { "" };
        push_folded(&mut out, "BEGIN:VEVENT");
        push_folded(&mut out, &format!("UID:{}", escape_text(e.uid)));
        push_folded(&mut out, &format!("DTSTAMP:{stamp}"));
        push_folded(&mut out, &format!("DTSTART{param}:{start}"));
        push_folded(&mut out, &format!("DTEND{param}:{end}"));
        push_folded(&mut out, &format!("SUMMARY:{}", escape_text(e.summary)));
        if let Some(d) = e.description {
            push_folded(&mut out, &format!("DESCRIPTION:{}", escape_text(d)));
        }
        if let Some(l) = e.location {
            push_folded(&mut out, &format!("LOCATION:{}", escape_text(l)));
        }
        if let Some(u) = e.url {
            push_folded(&mut out, &format!("URL:{u}"));
        }
        push_folded(&mut out, "END:VEVENT");
    }
    push_folded(&mut out, "END:VCALENDAR");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXPECTED: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Acme//Genlib//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nBEGIN:VEVENT\r\nUID:evt-1@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART:20261020T150000Z\r\nDTEND:20261020T163000Z\r\nSUMMARY:Office hours\\; Q&A\\, live\r\nDESCRIPTION:Bring questions.\\nRoom 4 \\\\ east wing. A folding test with caf\r\n é\\, then more words so the second line also runs past seventy-four octets\r\n  and folds again.\r\nLOCATION:Room 4\\, Main St.\r\nURL:https://example.com/e/1\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evt-2@example.com\r\nDTSTAMP:20261010T120000Z\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    fn events() -> Vec<IcsEvent<'static>> {
        vec![
            IcsEvent {
                uid: "evt-1@example.com",
                dtstamp: "2026-10-10T12:00:00Z",
                start: "2026-10-20T15:00:00Z",
                end: "2026-10-20T16:30:00Z",
                summary: "Office hours; Q&A, live",
                description: Some("Bring questions.\nRoom 4 \\ east wing. A folding test with café, then more words so the second line also runs past seventy-four octets and folds again."),
                location: Some("Room 4, Main St."),
                url: Some("https://example.com/e/1"),
            },
            IcsEvent {
                uid: "evt-2@example.com",
                dtstamp: "2026-10-10T12:00:00Z",
                start: "2026-12-24",
                end: "2026-12-25",
                summary: "Holiday",
                ..Default::default()
            },
        ]
    }

    #[test]
    fn calendar_vector() {
        let out = ics_calendar(&events(), "-//Acme//Genlib//EN").unwrap();
        assert_eq!(out, EXPECTED);
        assert!(out.split("\r\n").all(|l| l.len() <= 75));
    }

    #[test]
    fn rejections() {
        let base = events()[0].clone();
        let bad = [
            IcsEvent { end: base.start, ..base.clone() },
            IcsEvent { start: "2026-10-20", ..base.clone() },
            IcsEvent { uid: "", ..base.clone() },
            IcsEvent { url: Some("ftp://x"), ..base.clone() },
            IcsEvent { dtstamp: "2026-10-10", ..base.clone() },
            IcsEvent { summary: "", ..base.clone() },
            IcsEvent { start: "2026-13-01T00:00:00Z", ..base.clone() },
        ];
        for (i, e) in bad.iter().enumerate() {
            assert!(ics_calendar(std::slice::from_ref(e), "p").is_err(), "case {i}");
        }
    }

    #[test]
    fn escaping() {
        assert_eq!(escape_text("a\\b;c,d\r\ne\nf"), "a\\\\b\\;c\\,d\\ne\\nf");
    }
}
