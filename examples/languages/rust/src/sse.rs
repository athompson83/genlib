// SPDX-License-Identifier: Apache-2.0

//! Server-sent events following the WHATWG HTML "event stream" interpretation:
//! an incremental parser (text may arrive in arbitrary chunks, including a CRLF
//! split across two chunks) and a formatter.

use std::fmt;

/// Invalid formatter input, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SseError(pub String);

impl fmt::Display for SseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SseError {}

fn err<T>(m: &str) -> Result<T, SseError> {
    Err(SseError(m.to_string()))
}

/// One dispatched event; `event` defaults to "message" and `id` is the last id seen.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
    pub id: String,
}

/// Incremental event-stream parser.
#[derive(Clone, Debug, Default)]
pub struct SseParser {
    buf: String,
    data: Vec<String>,
    event: String,
    last_id: String,
    retry: Option<u64>,
    pending_cr: bool,
    started: bool,
}

impl SseParser {
    /// An empty parser.
    pub fn new() -> Self {
        Self::default()
    }

    /// The latest valid retry value in milliseconds (None until one arrives).
    pub fn retry(&self) -> Option<u64> {
        self.retry
    }

    /// Consumes a chunk of stream text and returns the events it completed.
    pub fn feed(&mut self, text: &str) -> Vec<SseEvent> {
        let mut out = Vec::new();
        let mut text = text;
        if !self.started && !text.is_empty() {
            text = text.strip_prefix('\u{FEFF}').unwrap_or(text);
            self.started = true;
        }
        for ch in text.chars() {
            if self.pending_cr {
                self.pending_cr = false;
                if ch == '\n' {
                    continue;
                }
            }
            match ch {
                '\r' => {
                    self.pending_cr = true;
                    self.line(&mut out);
                }
                '\n' => self.line(&mut out),
                c => self.buf.push(c),
            }
        }
        out
    }

    fn line(&mut self, out: &mut Vec<SseEvent>) {
        let line = std::mem::take(&mut self.buf);
        if line.is_empty() {
            if !self.data.is_empty() {
                let event = if self.event.is_empty() { "message".to_string() } else { self.event.clone() };
                out.push(SseEvent { event, data: self.data.join("\n"), id: self.last_id.clone() });
            }
            self.data.clear();
            self.event.clear();
            return;
        }
        if line.starts_with(':') {
            return;
        }
        let (field, value) = match line.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (line.as_str(), ""),
        };
        match field {
            "data" => self.data.push(value.to_string()),
            "event" => self.event = value.to_string(),
            "id" => {
                if !value.contains('\0') {
                    self.last_id = value.to_string();
                }
            }
            "retry" if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) => {
                // Values too large for u64 are ignored.
                if let Ok(n) = value.parse::<u64>() {
                    self.retry = Some(n);
                }
            }
            _ => {}
        }
    }
}

/// All complete events in `text`; an unterminated final event is dropped.
pub fn parse_sse(text: &str) -> Vec<SseEvent> {
    SseParser::new().feed(text)
}

/// One event as stream text: event, id and retry lines (when given), one data line per line of data, then a blank line.
pub fn format_sse(data: &str, event: Option<&str>, id: Option<&str>, retry: Option<i64>) -> Result<String, SseError> {
    let breaks = |s: &str| s.contains('\r') || s.contains('\n');
    if event.is_some_and(breaks) {
        return err("event must not contain line breaks");
    }
    if id.is_some_and(breaks) {
        return err("id must not contain line breaks");
    }
    if id.is_some_and(|s| s.contains('\0')) {
        return err("id must not contain NUL");
    }
    if retry.is_some_and(|r| r < 0) {
        return err("retry must be >= 0");
    }
    let mut out = String::new();
    if let Some(e) = event {
        out.push_str(&format!("event: {e}\n"));
    }
    if let Some(i) = id {
        out.push_str(&format!("id: {i}\n"));
    }
    if let Some(r) = retry {
        out.push_str(&format!("retry: {r}\n"));
    }
    for line in data.replace("\r\n", "\n").replace('\r', "\n").split('\n') {
        out.push_str(&format!("data: {line}\n"));
    }
    out.push('\n');
    Ok(out)
}

/// A comment line (keep-alive ping): ":\n\n" for empty text, else ": text\n\n".
pub fn format_comment(text: &str) -> Result<String, SseError> {
    if text.contains('\r') || text.contains('\n') {
        return err("comment must be one line");
    }
    Ok(if text.is_empty() { ":\n\n".to_string() } else { format!(": {text}\n\n") })
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    type Ev<'a> = (&'a str, &'a str, &'a str);

    fn evs(e: &[Ev]) -> Vec<SseEvent> {
        e.iter().map(|&(event, data, id)| SseEvent { event: event.into(), data: data.into(), id: id.into() }).collect()
    }

    #[test]
    fn parse_vectors() {
        let cases: &[(&str, &[Ev], Option<u64>)] = &[
            ("data: YHOO\ndata: +2\ndata: 10\n\n", &[("message", "YHOO\n+2\n10", "")], None),
            (": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", &[("message", "first event", "1"), ("message", "second event", "")], None),
            ("data\n\ndata\ndata\n\ndata:", &[("message", "", ""), ("message", "\n", "")], None),
            ("data:test\n\ndata: test\n\n", &[("message", "test", ""), ("message", "test", "")], None),
            ("event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", &[("add", "73857293", ""), ("remove", "2153", ""), ("add", "113411", "")], None),
            ("\u{feff}data: bom\n\n", &[("message", "bom", "")], None),
            ("data: a\r\ndata: b\r\rdata: c\n\n", &[("message", "a\nb", ""), ("message", "c", "")], None),
            ("id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", &[("message", "x", "7"), ("message", "y", "7"), ("message", "z", "")], None),
            ("id: a\u{0}b\ndata: nul\n\n", &[("message", "nul", "")], None),
            ("retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", &[("message", "r", ""), ("message", "s", "")], Some(1500)),
            ("event\ndata: e\n\n", &[("message", "e", "")], None),
            ("unknown: q\ndata: u\n\n", &[("message", "u", "")], None),
            (":\n:comment\ndata: ok\n\n", &[("message", "ok", "")], None),
            ("data: no blank line at end", &[], None),
        ];
        for (text, want, retry) in cases {
            let mut p = SseParser::new();
            assert_eq!(p.feed(text), evs(want), "{text:?}");
            assert_eq!(p.retry(), *retry, "{text:?}");
            assert_eq!(parse_sse(text), evs(want));
        }
    }

    #[test]
    fn chunked_vectors() {
        let cases: &[(&[&str], &[Ev])] = &[
            (&["data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"], &[("message", "YHOO\n+2\n10", "")]),
            (&[": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"], &[("message", "first event", "1"), ("message", "second event", "")]),
            (&["da", "ta\n\nda", "ta\ndata", "\n\ndata:"], &[("message", "", ""), ("message", "\n", "")]),
            (&["data", ":t", "est\n\nd", "ata: test\n\n"], &[("message", "test", ""), ("message", "test", "")]),
            (&["event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"], &[("add", "73857293", ""), ("remove", "2153", ""), ("add", "113411", "")]),
            (&["\u{feff}d", "at", "a: bo", "m\n\n"], &[("message", "bom", "")]),
            (&["d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"], &[("message", "a\nb", ""), ("message", "c", "")]),
            (&["id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"], &[("message", "x", "7"), ("message", "y", "7"), ("message", "z", "")]),
            (&["id:", " a\u{0}", "b\ndata:", " nul\n\n"], &[("message", "nul", "")]),
            (&["r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"], &[("message", "r", ""), ("message", "s", "")]),
        ];
        for (chunks, want) in cases {
            let mut p = SseParser::new();
            let got: Vec<SseEvent> = chunks.iter().flat_map(|c| p.feed(c)).collect();
            assert_eq!(got, evs(want), "{chunks:?}");
        }
    }

    #[test]
    fn format_vectors() {
        let cases: &[(&str, Option<&str>, Option<&str>, Option<i64>, &str)] = &[
            ("hello", None, None, None, "data: hello\n\n"),
            ("a\nb\r\nc", Some("update"), Some("42"), None, "event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n"),
            ("", None, None, Some(3000), "retry: 3000\ndata: \n\n"),
            ("{\"x\":1}", Some("json"), Some(""), None, "event: json\nid: \ndata: {\"x\":1}\n\n"),
        ];
        for &(data, event, id, retry, want) in cases {
            assert_eq!(format_sse(data, event, id, retry).unwrap(), want);
        }
        let invalid: &[(&str, Option<&str>, Option<&str>, Option<i64>)] = &[
            ("x", Some("a\nb"), None, None),
            ("x", None, Some("a\rb"), None),
            ("x", None, Some("a\u{0}"), None),
            ("x", None, None, Some(-1)),
        ];
        for &(data, event, id, retry) in invalid {
            assert!(format_sse(data, event, id, retry).is_err(), "{event:?} {id:?} {retry:?}");
        }
        assert_eq!(format_comment("").unwrap(), ":\n\n");
        assert_eq!(format_comment("ping").unwrap(), ": ping\n\n");
        assert!(format_comment("a\nb").is_err());
    }
}
