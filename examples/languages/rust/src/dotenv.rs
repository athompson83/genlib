// SPDX-License-Identifier: Apache-2.0

//! `.env` file parsing: blank and '#' comment lines are skipped, an `export `
//! prefix is allowed, keys match `[A-Za-z_][A-Za-z0-9_.]*`, unquoted values are
//! trimmed and end at " #", single-quoted values are literal, double-quoted
//! values may span lines with escapes `\n \r \t \" \\ \$`. A later key overrides
//! an earlier one but keeps the first position. Optional expansion replaces
//! `${NAME}` and `${NAME:-default}` in unquoted and double-quoted values from
//! earlier keys, then `vars` (empty counts as missing for `:-`).

use std::collections::HashMap;
use std::fmt;

/// A syntax error with its 1-based line number.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DotenvError {
    pub line: usize,
    pub message: String,
}

impl fmt::Display for DotenvError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "dotenv: line {}: {}", self.line, self.message)
    }
}

impl std::error::Error for DotenvError {}

const MARKER: &str = "\u{0}$"; // an escaped \$ that must never be expanded

fn key_char(c: u8, first: bool) -> bool {
    c == b'_' || c.is_ascii_alphabetic() || (!first && (c.is_ascii_digit() || c == b'.'))
}

fn valid_key(k: &str) -> bool {
    !k.is_empty() && k.bytes().enumerate().all(|(i, c)| key_char(c, i == 0))
}

#[derive(PartialEq)]
enum Kind {
    Plain,
    Single,
    Double,
}

/// Parses `.env` text into ordered pairs; with `expand`, `${NAME}` resolves against earlier keys, then `vars`.
pub fn parse_dotenv(text: &str, expand: bool, vars: &[(&str, &str)]) -> Result<Vec<(String, String)>, DotenvError> {
    let normalized = text.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();
    let mut out: Vec<(String, String, Kind)> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let no = i + 1;
        let fail = |m: String| Err(DotenvError { line: no, message: m });
        let mut s = lines[i].trim();
        i += 1;
        if s.is_empty() || s.starts_with('#') {
            continue;
        }
        if let Some(r) = s.strip_prefix("export ") {
            s = r.trim_start();
        }
        let Some((k, rest)) = s.split_once('=') else { return fail("expected KEY=VALUE".into()) };
        let key = k.trim();
        if !valid_key(key) {
            return fail(format!("invalid key {:?}", key));
        }
        let rest = rest.trim_start();
        let (val, tail, kind) = if let Some(r) = rest.strip_prefix('\'') {
            let Some(end) = r.find('\'') else { return fail("unterminated single quote".into()) };
            (r[..end].to_string(), r[end + 1..].to_string(), Kind::Single)
        } else if let Some(r) = rest.strip_prefix('"') {
            let mut buf: Vec<char> = r.chars().collect();
            let mut val = String::new();
            let mut j = 0;
            let tail;
            loop {
                let mut closed = false;
                while j < buf.len() {
                    let c = buf[j];
                    if c == '\\' && j + 1 < buf.len() {
                        match buf[j + 1] {
                            'n' => val.push('\n'),
                            'r' => val.push('\r'),
                            't' => val.push('\t'),
                            n @ ('"' | '\\') => val.push(n),
                            '$' => val.push_str(MARKER),
                            n => {
                                val.push('\\');
                                val.push(n);
                            }
                        }
                        j += 2;
                        continue;
                    }
                    if c == '"' {
                        closed = true;
                        break;
                    }
                    val.push(c);
                    j += 1;
                }
                if closed {
                    tail = buf[j + 1..].iter().collect::<String>();
                    break;
                }
                if i >= lines.len() {
                    return fail("unterminated double quote".into());
                }
                val.push('\n');
                buf = lines[i].chars().collect();
                i += 1;
                j = 0;
            }
            (val, tail, Kind::Double)
        } else {
            let mut cut = rest.len();
            let mut prev_space = false;
            for (k, c) in rest.char_indices() {
                if c == '#' && prev_space {
                    cut = k; // the whitespace before '#' is trimmed below
                    break;
                }
                prev_space = c.is_whitespace();
            }
            (rest[..cut].trim().to_string(), String::new(), Kind::Plain)
        };
        let t = tail.trim();
        if !t.is_empty() && !t.starts_with('#') {
            return fail("unexpected text after closing quote".into());
        }
        match out.iter_mut().find(|e| e.0 == key) {
            Some(e) => {
                e.1 = val;
                e.2 = kind;
            }
            None => out.push((key.to_string(), val, kind)),
        }
    }
    if expand {
        let vars: HashMap<&str, &str> = vars.iter().copied().collect();
        let mut done: HashMap<String, String> = HashMap::new();
        for e in out.iter_mut() {
            if e.2 != Kind::Single {
                e.1 = expand_value(&e.1, &done, &vars);
            }
            done.insert(e.0.clone(), e.1.clone());
        }
    }
    Ok(out.into_iter().map(|(k, v, _)| (k, v.replace(MARKER, "$"))).collect())
}

fn expand_value(v: &str, done: &HashMap<String, String>, vars: &HashMap<&str, &str>) -> String {
    let b = v.as_bytes();
    let mut out = String::new();
    let mut i = 0;
    let mut lit = 0; // start of the pending literal run
    while i < b.len() {
        if b[i] == b'$' && i + 1 < b.len() && b[i + 1] == b'{' && (i == 0 || b[i - 1] != 0) && i + 2 < b.len() && key_char(b[i + 2], true) {
            let mut j = i + 3;
            while j < b.len() && key_char(b[j], false) {
                j += 1;
            }
            let name = &v[i + 2..j];
            let mut found = None;
            if j < b.len() && b[j] == b'}' {
                found = Some((j, None));
            } else if v[j..].starts_with(":-") {
                if let Some(c) = v[j + 2..].find('}') {
                    found = Some((j + 2 + c, Some(&v[j + 2..j + 2 + c])));
                }
            }
            if let Some((end, dflt)) = found {
                out.push_str(&v[lit..i]);
                let got = done.get(name).map(String::as_str).or_else(|| vars.get(name).copied()).unwrap_or("");
                out.push_str(if got.is_empty() { dflt.unwrap_or("") } else { got });
                i = end + 1;
                lit = i;
                continue;
            }
        }
        i += 1;
    }
    out.push_str(&v[lit..]);
    out
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn parse_vectors() {
        let cases: &[(&str, &[(&str, &str)])] = &[
            ("A=1\nB=two\n", &[("A", "1"), ("B", "two")]),
            ("# c\n\nexport KEY = value with spaces  # comment\n", &[("KEY", "value with spaces")]),
            ("Q=\"a\\nb\\t\\\"c\\\" \\\\ \\$HOME\"\n", &[("Q", "a\nb\t\"c\" \\ $HOME")]),
            ("S='raw ${X} \\n'\n", &[("S", "raw ${X} \\n")]),
            ("M=\"line1\nline2\"\nN=after\n", &[("M", "line1\nline2"), ("N", "after")]),
            ("E=\nF= \n", &[("E", ""), ("F", "")]),
            ("DUP=1\nDUP=2\n", &[("DUP", "2")]),
            ("URL=https://x.test/#frag\n", &[("URL", "https://x.test/#frag")]),
            ("H=a#b\n", &[("H", "a#b")]),
            ("K.x_y=1\n", &[("K.x_y", "1")]),
            ("W=\"x\" # trailing ok\n", &[("W", "x")]),
            ("CRLF=1\r\nNEXT=2\r\n", &[("CRLF", "1"), ("NEXT", "2")]),
        ];
        for &(text, want) in cases {
            let got = parse_dotenv(text, false, &[]).unwrap();
            let want: Vec<(String, String)> = want.iter().map(|&(k, v)| (k.to_string(), v.to_string())).collect();
            assert_eq!(got, want, "{text:?}");
        }
    }

    #[test]
    fn expand_vectors() {
        let cases: &[(&str, &[(&str, &str)], &[(&str, &str)])] = &[
            ("A=1\nB=${A}-x\n", &[], &[("A", "1"), ("B", "1-x")]),
            ("B=${A}\nA=1\n", &[("A", "env")], &[("B", "env"), ("A", "1")]),
            ("P=${MISSING:-fallback}\nQ=${EMPTY:-d}\n", &[("EMPTY", "")], &[("P", "fallback"), ("Q", "d")]),
            ("S='${A}'\nT=\"${A}\"\nU=\"\\${A}\"\n", &[("A", "v")], &[("S", "${A}"), ("T", "v"), ("U", "${A}")]),
        ];
        for &(text, vars, want) in cases {
            let got = parse_dotenv(text, true, vars).unwrap();
            let want: Vec<(String, String)> = want.iter().map(|&(k, v)| (k.to_string(), v.to_string())).collect();
            assert_eq!(got, want, "{text:?}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for text in &["NOEQUALS\n", "1BAD=x\n", "A='unterminated\n", "A=\"never closed\nB=1\n", "A=\"x\" junk\n", "-K=v\n"] {
            assert_eq!(parse_dotenv(text, false, &[]).unwrap_err().line, 1, "{text:?}");
        }
        let e = parse_dotenv("A=1\n\nB='x\n", false, &[]).unwrap_err();
        assert_eq!(e.line, 3);
        assert!(e.to_string().contains("line 3"));
    }
}
