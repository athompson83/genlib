// SPDX-License-Identifier: Apache-2.0

//! The common INI subset used by git config, PHP and Python configparser
//! defaults. Sections and keys keep their order and case; keys before any
//! header go in section "" (always present and first).
//!
//! Lines are trimmed; blank lines and lines starting with ';' or '#' are
//! skipped. `[name]` starts a section (a repeated name continues it). Key and
//! value are split at the first '=' or ':'; a bare key has the value "". A
//! value wrapped in double quotes is unquoted with `\\ \" \n \t` escapes;
//! otherwise an inline comment starts at whitespace followed by ';' or '#'.
//! The last duplicate key wins and keeps its first position. Errors name the
//! 1-based line.

use std::fmt;

/// Ordered sections, each an ordered list of (key, value) pairs.
pub type Ini = Vec<(String, Vec<(String, String)>)>;

/// INI syntax error with its 1-based line number in the message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IniError(pub String);

impl fmt::Display for IniError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ini: {}", self.0)
    }
}

impl std::error::Error for IniError {}

/// Python `str.isspace` (Unicode White_Space plus U+001C..U+001F).
fn is_space(c: char) -> bool {
    c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c)
}

fn trim(s: &str) -> &str {
    s.trim_matches(is_space)
}

/// Parses INI text into ordered sections, section "" first.
pub fn parse_ini(text: &str) -> Result<Ini, IniError> {
    let mut out: Ini = vec![(String::new(), Vec::new())];
    let mut cur = 0;
    let normalized = text.replace("\r\n", "\n");
    for (no, line) in normalized.split('\n').enumerate() {
        let no = no + 1;
        let fail = |m: &str| Err(IniError(format!("line {no}: {m}")));
        let s = trim(line);
        if s.is_empty() || s.starts_with(';') || s.starts_with('#') {
            continue;
        }
        if s.starts_with('[') {
            if !s.ends_with(']') || s.len() < 2 {
                return fail("unterminated section header");
            }
            let name = trim(&s[1..s.len() - 1]);
            if name.is_empty() || name.contains(']') {
                return fail("bad section name");
            }
            cur = match out.iter().position(|(n, _)| n == name) {
                Some(p) => p,
                None => {
                    out.push((name.to_string(), Vec::new()));
                    out.len() - 1
                }
            };
            continue;
        }
        let (key, mut val) = match s.find(['=', ':']) {
            Some(i) => (trim(&s[..i]), trim(&s[i + 1..]).to_string()),
            None => (s, String::new()),
        };
        if key.is_empty() {
            return fail("empty key");
        }
        if let Some(body) = val.strip_prefix('"') {
            let chars: Vec<char> = body.chars().collect();
            let mut buf = String::new();
            let mut closed = false;
            let mut j = 0;
            while j < chars.len() {
                let c = chars[j];
                if c == '\\' && j + 1 < chars.len() {
                    buf.push(match chars[j + 1] {
                        'n' => '\n',
                        't' => '\t',
                        other => other,
                    });
                    j += 2;
                    continue;
                }
                if c == '"' {
                    closed = true;
                    break;
                }
                buf.push(c);
                j += 1;
            }
            if !closed {
                return fail("unterminated quote");
            }
            val = buf;
        } else if let Some(cut) = [" ;", " #", "\t;", "\t#"]
            .iter()
            .filter_map(|m| val.find(m))
            .min()
        {
            val = val[..cut].trim_end_matches(is_space).to_string();
        }
        let section = &mut out[cur].1;
        match section.iter_mut().find(|(k, _)| k == key) {
            Some(slot) => slot.1 = val,
            None => section.push((key.to_string(), val)),
        }
    }
    Ok(out)
}

fn quote(v: &str) -> String {
    if v.is_empty() || v != trim(v) || v.contains([';', '#', '"', '\\', '\n', '\t']) {
        let escaped = v
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\t', "\\t");
        format!("\"{escaped}\"")
    } else {
        v.to_string()
    }
}

fn lines(entries: &[(String, String)]) -> Vec<String> {
    entries
        .iter()
        .map(|(k, v)| format!("{k} = {}", quote(v)))
        .collect()
}

/// Writes section "" first (no header), then `[name]` blocks separated by one blank line.
pub fn stringify_ini(data: &Ini) -> String {
    let mut blocks = Vec::new();
    if let Some((_, top)) = data.iter().find(|(n, _)| n.is_empty()) {
        if !top.is_empty() {
            blocks.push(lines(top).join("\n"));
        }
    }
    for (name, entries) in data.iter().filter(|(n, _)| !n.is_empty()) {
        let mut block = vec![format!("[{name}]")];
        block.extend(lines(entries));
        blocks.push(block.join("\n"));
    }
    if blocks.is_empty() {
        String::new()
    } else {
        blocks.join("\n\n") + "\n"
    }
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn parse_vectors() {
        let cases: Vec<(&str, Ini)> = vec![
            (
                "a=1\nb = two\n",
                vec![(
                    "".to_string(),
                    vec![
                        ("a".to_string(), "1".to_string()),
                        ("b".to_string(), "two".to_string()),
                    ],
                )],
            ),
            (
                "[db]\nhost = localhost ; comment\nport: 5432\n",
                vec![
                    ("".to_string(), vec![]),
                    (
                        "db".to_string(),
                        vec![
                            ("host".to_string(), "localhost".to_string()),
                            ("port".to_string(), "5432".to_string()),
                        ],
                    ),
                ],
            ),
            (
                "; c\n# c\n\n[s]\nk=\"quoted \\\"x\\\" \\\\ ;#\"\n",
                vec![
                    ("".to_string(), vec![]),
                    (
                        "s".to_string(),
                        vec![("k".to_string(), "quoted \"x\" \\ ;#".to_string())],
                    ),
                ],
            ),
            (
                "[s]\nflag\nx = a#b\ny = a #b\n",
                vec![
                    ("".to_string(), vec![]),
                    (
                        "s".to_string(),
                        vec![
                            ("flag".to_string(), "".to_string()),
                            ("x".to_string(), "a#b".to_string()),
                            ("y".to_string(), "a".to_string()),
                        ],
                    ),
                ],
            ),
            (
                "[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n",
                vec![
                    ("".to_string(), vec![]),
                    (
                        "a".to_string(),
                        vec![
                            ("k".to_string(), "3".to_string()),
                            ("j".to_string(), "4".to_string()),
                        ],
                    ),
                    ("b".to_string(), vec![("k".to_string(), "2".to_string())]),
                ],
            ),
            (
                "k: v = w\n",
                vec![("".to_string(), vec![("k".to_string(), "v = w".to_string())])],
            ),
            (
                "[ spaced name ]\nK=V\r\nk2=v2\r\n",
                vec![
                    ("".to_string(), vec![]),
                    (
                        "spaced name".to_string(),
                        vec![
                            ("K".to_string(), "V".to_string()),
                            ("k2".to_string(), "v2".to_string()),
                        ],
                    ),
                ],
            ),
            ("", vec![("".to_string(), vec![])]),
        ];
        for (text, want) in cases {
            assert_eq!(parse_ini(text), Ok(want), "{text:?}");
        }
    }

    #[test]
    fn stringify_vectors() {
        let cases: Vec<(Ini, &str)> = vec![
            (
                vec![
                    ("".to_string(), vec![("a".to_string(), "1".to_string())]),
                    (
                        "s".to_string(),
                        vec![
                            ("k".to_string(), "v".to_string()),
                            ("e".to_string(), "".to_string()),
                            ("sp".to_string(), " x".to_string()),
                            ("q".to_string(), "a\"b;c".to_string()),
                        ],
                    ),
                ],
                "a = 1\n\n[s]\nk = v\ne = \"\"\nsp = \" x\"\nq = \"a\\\"b;c\"\n",
            ),
            (
                vec![
                    ("".to_string(), vec![]),
                    ("only".to_string(), vec![("x".to_string(), "y".to_string())]),
                ],
                "[only]\nx = y\n",
            ),
            (vec![("".to_string(), vec![])], ""),
        ];
        for (data, want) in cases {
            assert_eq!(stringify_ini(&data), want);
            assert_eq!(stringify_ini(&parse_ini(want).unwrap()), want, "round trip");
        }
    }

    #[test]
    fn invalid_vectors() {
        for t in ["[unterminated\n", "[]\n", "=v\n", "k=\"open\n", "[a]]\n"] {
            let e = parse_ini(t).unwrap_err();
            assert!(e.0.starts_with("line 1:"), "{t:?}: {e}");
        }
    }
}
