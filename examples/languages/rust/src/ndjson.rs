// SPDX-License-Identifier: Apache-2.0

//! Newline-delimited JSON on the [`Json`] value type of the `json_patch`
//! module (whose strict parser reads each line).
//!
//! [`parse_ndjson`] splits on LF (a trailing CR on a line is removed), skips
//! lines that are empty or only spaces and tabs, and requires every other line
//! to be exactly one JSON value. [`stringify_ndjson`] writes each value
//! compactly with object keys in insertion order (unlike
//! `json_patch::canonical`, which sorts them), escapes only `"`, `\` and
//! U+0000..U+001F (short escapes or lowercase `\u00xx`), keeps non-ASCII as
//! UTF-8 and ends every value with LF. Whole numbers print without a decimal
//! point; other numbers use Rust's shortest round-trip form.

use crate::json_patch::{parse, Json};
use std::fmt;

/// The 1-based line that is not a single JSON value, with the parser message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NdjsonError {
    pub line: usize,
    pub message: String,
}

impl fmt::Display for NdjsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ndjson: line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for NdjsonError {}

/// Parses one JSON value per non-blank line.
pub fn parse_ndjson(text: &str) -> Result<Vec<Json>, NdjsonError> {
    let mut out = Vec::new();
    for (i, line) in text.split('\n').enumerate() {
        let line = line.strip_suffix('\r').unwrap_or(line);
        if line.trim_matches([' ', '\t']).is_empty() {
            continue;
        }
        match parse(line) {
            Ok(v) => out.push(v),
            Err(e) => {
                return Err(NdjsonError {
                    line: i + 1,
                    message: e.0,
                })
            }
        }
    }
    Ok(out)
}

fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write(out: &mut String, v: &Json) {
    match v {
        Json::Null => out.push_str("null"),
        Json::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Json::Number(n) if *n == 0.0 => out.push('0'),
        Json::Number(n) => out.push_str(&format!("{n}")),
        Json::String(s) => write_string(out, s),
        Json::Array(items) => {
            out.push('[');
            for (i, x) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write(out, x);
            }
            out.push(']');
        }
        Json::Object(members) => {
            out.push('{');
            for (i, (k, x)) in members.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_string(out, k);
                out.push(':');
                write(out, x);
            }
            out.push('}');
        }
    }
}

/// Writes each value compactly, keys in insertion order, followed by a newline.
pub fn stringify_ndjson(values: &[Json]) -> String {
    let mut out = String::new();
    for v in values {
        write(&mut out, v);
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn parse_vectors() {
        let cases: Vec<(&str, Vec<Json>)> = vec![
            (
                "{\"a\":1}\n{\"b\":[1,2]}\n",
                vec![
                    Json::Object(vec![("a".into(), Json::Number(1.0))]),
                    Json::Object(vec![(
                        "b".into(),
                        Json::Array(vec![Json::Number(1.0), Json::Number(2.0)]),
                    )]),
                ],
            ),
            (
                "\n  \n1\r\n\"x\"\ntrue\nnull\n",
                vec![
                    Json::Number(1.0),
                    Json::String("x".into()),
                    Json::Bool(true),
                    Json::Null,
                ],
            ),
            ("", vec![]),
            (
                "{\"k\":\"caf\u{e9}\"}",
                vec![Json::Object(vec![(
                    "k".into(),
                    Json::String("caf\u{e9}".into()),
                )])],
            ),
        ];
        for (text, want) in cases {
            assert_eq!(parse_ndjson(text), Ok(want), "{text:?}");
        }
        for (text, line) in [
            ("{\"a\":1}\n{bad}\n", 2),
            ("1 2", 1),
            ("{\"a\":1}\n\n[1,", 3),
        ] {
            assert_eq!(
                parse_ndjson(text).map_err(|e| e.line),
                Err(line),
                "{text:?}"
            );
        }
    }

    #[test]
    fn stringify_vectors() {
        let cases: Vec<(Vec<Json>, &str)> = vec![
            (
                vec![Json::Object(vec![
                    ("a".into(), Json::Number(1.0)),
                    (
                        "b".into(),
                        Json::Array(vec![Json::Bool(true), Json::Null, Json::String("x".into())]),
                    ),
                ])],
                "{\"a\":1,\"b\":[true,null,\"x\"]}\n",
            ),
            (
                vec![
                    Json::Number(1.0),
                    Json::String("two".into()),
                    Json::Bool(false),
                ],
                "1\n\"two\"\nfalse\n",
            ),
            (vec![], ""),
            (
                vec![Json::Object(vec![(
                    "q".into(),
                    Json::String("say \"hi\"\\ \n\t\u{1} caf\u{e9}".into()),
                )])],
                "{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u{e9}\"}\n",
            ),
            (
                vec![Json::Object(vec![
                    ("z".into(), Json::Number(1.0)),
                    ("a".into(), Json::Number(2.0)),
                ])],
                "{\"z\":1,\"a\":2}\n",
            ),
            (vec![Json::Array(vec![]), Json::Object(vec![])], "[]\n{}\n"),
            (vec![Json::Number(-42.0), Json::Number(0.0)], "-42\n0\n"),
        ];
        for (values, want) in cases {
            let got = stringify_ndjson(&values);
            assert_eq!(got, want);
            assert_eq!(parse_ndjson(&got), Ok(values));
        }
        assert_eq!(stringify_ndjson(&[Json::Number(2.5)]), "2.5\n");
    }
}
