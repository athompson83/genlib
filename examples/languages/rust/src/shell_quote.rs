// SPDX-License-Identifier: Apache-2.0

//! POSIX shell quoting and splitting without any expansion (`$`, `*`, `~`
//! stay literal).
//!
//! [`shell_quote`] leaves words made only of `[A-Za-z0-9@%+=:,./_-]`
//! unchanged and wraps everything else in single quotes. [`shell_split`]
//! follows sh word rules: single quotes are literal; inside double quotes a
//! backslash escapes only `$`, backtick, `"`, `\` and newline; outside quotes
//! it escapes any character; backslash-newline is removed; `#` starts a
//! comment only at the start of a word.

use std::fmt;

/// An unterminated quote or a trailing backslash.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SplitError(pub String);

impl fmt::Display for SplitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "shell split: {}", self.0)
    }
}

impl std::error::Error for SplitError {}

fn err<T>(m: &str) -> Result<T, SplitError> {
    Err(SplitError(m.to_string()))
}

/// Quotes `arg` so that a POSIX shell reads it as one word.
pub fn shell_quote(arg: &str) -> String {
    if arg.is_empty() {
        return "''".into();
    }
    if arg
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "@%+=:,./_-".contains(c))
    {
        return arg.into();
    }
    format!("'{}'", arg.replace('\'', "'\\''"))
}

/// Quotes each argument and joins them with single spaces.
pub fn shell_join<S: AsRef<str>>(args: &[S]) -> String {
    args.iter()
        .map(|a| shell_quote(a.as_ref()))
        .collect::<Vec<_>>()
        .join(" ")
}

/// Splits a command line into words using POSIX quoting rules.
pub fn shell_split(line: &str) -> Result<Vec<String>, SplitError> {
    let r: Vec<char> = line.chars().collect();
    let n = r.len();
    let mut words = Vec::new();
    let mut cur: Option<String> = None;
    let mut i = 0;
    while i < n {
        let c = r[i];
        if c == ' ' || c == '\t' || c == '\n' {
            if let Some(w) = cur.take() {
                words.push(w);
            }
            i += 1;
            continue;
        }
        if c == '#' && cur.is_none() {
            while i < n && r[i] != '\n' {
                i += 1;
            }
            continue;
        }
        let word = cur.get_or_insert_with(String::new);
        match c {
            '\'' => {
                let j = match r[i + 1..].iter().position(|&d| d == '\'') {
                    Some(p) => i + 1 + p,
                    None => return err("unterminated single quote"),
                };
                word.extend(&r[i + 1..j]);
                i = j + 1;
            }
            '"' => {
                i += 1;
                loop {
                    if i >= n {
                        return err("unterminated double quote");
                    }
                    let d = r[i];
                    if d == '"' {
                        i += 1;
                        break;
                    }
                    if d == '\\' && i + 1 < n && "$`\"\\\n".contains(r[i + 1]) {
                        if r[i + 1] != '\n' {
                            word.push(r[i + 1]);
                        }
                        i += 2;
                        continue;
                    }
                    word.push(d);
                    i += 1;
                }
            }
            '\\' => {
                if i + 1 >= n {
                    return err("trailing backslash");
                }
                if r[i + 1] != '\n' {
                    word.push(r[i + 1]);
                } else if word.is_empty() {
                    cur = None;
                }
                i += 2;
            }
            _ => {
                word.push(c);
                i += 1;
            }
        }
    }
    if let Some(w) = cur {
        words.push(w);
    }
    Ok(words)
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn quote_vectors() {
        for (a, want) in [
            ("", "''"),
            ("abc", "abc"),
            ("a b", "'a b'"),
            ("it's", "'it'\\''s'"),
            ("a\"b", "'a\"b'"),
            ("$HOME", "'$HOME'"),
            ("*.txt", "'*.txt'"),
            ("x=1", "x=1"),
            ("path/to/file.txt", "path/to/file.txt"),
            ("tab\there", "'tab\there'"),
            ("line\nbreak", "'line\nbreak'"),
            ("\u{e9}", "'\u{e9}'"),
            ("-n", "-n"),
            ("~user", "'~user'"),
            ("!bang", "'!bang'"),
            ("''", "''\\'''\\'''"),
        ] {
            assert_eq!(shell_quote(a), want, "{a:?}");
        }
        assert_eq!(
            shell_join::<&str>(&["ls", "-la", "my file", "it's"]),
            "ls -la 'my file' 'it'\\''s'"
        );
        assert_eq!(shell_join::<&str>(&[]), "");
    }

    #[test]
    fn split_vectors() {
        let cases: Vec<(&str, Vec<&str>)> = vec![
            ("a b  c", vec!["a", "b", "c"]),
            ("'a b' c", vec!["a b", "c"]),
            ("\"a b\" c", vec!["a b", "c"]),
            ("a\\ b", vec!["a b"]),
            ("\"say \\\"hi\\\"\"", vec!["say \"hi\""]),
            ("\"keep \\n and \\x\"", vec!["keep \\n and \\x"]),
            ("'no \\escape'", vec!["no \\escape"]),
            ("x\"y\"'z'w", vec!["xyzw"]),
            ("'' \"\"", vec!["", ""]),
            ("a\tb\nc", vec!["a", "b", "c"]),
            ("echo $HOME *.txt ~", vec!["echo", "$HOME", "*.txt", "~"]),
            ("\"a\\\nb\"", vec!["ab"]),
            ("a\\\nb", vec!["ab"]),
            ("# comment", vec![]),
            ("cmd # trailing comment", vec!["cmd"]),
            ("a#b", vec!["a#b"]),
            ("\"$x\"", vec!["$x"]),
            ("  lead  trail  ", vec!["lead", "trail"]),
        ];
        for (line, want) in cases {
            assert_eq!(
                shell_split(line),
                Ok(want.iter().map(|s| s.to_string()).collect()),
                "{line:?}"
            );
        }
        for line in ["'open", "\"open", "trail\\", "\"bad \\"] {
            assert!(shell_split(line).is_err(), "{line:?}");
        }
    }

    #[test]
    fn round_trips() {
        let args = [
            "",
            "abc",
            "a b",
            "it's",
            "a\"b",
            "$HOME",
            "*.txt",
            "x=1",
            "path/to/file.txt",
            "tab\there",
            "line\nbreak",
            "\u{e9}",
            "-n",
            "~user",
            "!bang",
            "''",
        ];
        for a in args {
            assert_eq!(
                shell_split(&shell_quote(a)),
                Ok(vec![a.to_string()]),
                "{a:?}"
            );
        }
        assert_eq!(
            shell_split(&shell_join(&args)),
            Ok(args.iter().map(|s| s.to_string()).collect())
        );
    }
}
