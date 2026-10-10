// SPDX-License-Identifier: Apache-2.0

//! RFC 4180 CSV writing and parsing with spreadsheet formula-injection
//! neutralization (OWASP CSV injection guidance). Standard library only.

use std::fmt;

/// Parse error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CsvError(pub String);

impl fmt::Display for CsvError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CsvError {}

fn write_field(out: &mut String, value: &str, neutralize: bool) {
    let mut field = String::with_capacity(value.len() + 1);
    if neutralize && value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        field.push('\'');
    }
    field.push_str(value);
    let quote = field.contains([',', '"', '\r', '\n']) || field.starts_with(' ') || field.ends_with(' ');
    if quote {
        out.push('"');
        out.push_str(&field.replace('"', "\"\""));
        out.push('"');
    } else {
        out.push_str(&field);
    }
}

/// Writes rows as CSV; every record (including the last) ends with CRLF.
/// With `neutralize_formulas`, fields starting with `=`, `+`, `-`, `@`, TAB
/// or CR get a leading `'` so spreadsheets do not evaluate them.
pub fn write_csv<R: AsRef<[S]>, S: AsRef<str>>(rows: &[R], neutralize_formulas: bool) -> String {
    let mut out = String::new();
    for row in rows {
        for (i, value) in row.as_ref().iter().enumerate() {
            if i > 0 {
                out.push(',');
            }
            write_field(&mut out, value.as_ref(), neutralize_formulas);
        }
        out.push_str("\r\n");
    }
    out
}

/// Parses CSV text (CRLF or LF record ends, optional leading BOM). Fields are
/// returned exactly as stored; neutralization is never added or removed.
pub fn parse_csv(text: &str) -> Result<Vec<Vec<String>>, CsvError> {
    let text = text.strip_prefix('\u{FEFF}').unwrap_or(text);
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let is_crlf = |i: usize| chars[i] == '\r' && i + 1 < n && chars[i + 1] == '\n';
    let mut rows = Vec::new();
    if n == 0 {
        return Ok(rows);
    }
    let mut row = Vec::new();
    let mut i = 0;
    loop {
        let mut field = String::new();
        if chars[i..].first() == Some(&'"') {
            i += 1;
            loop {
                if i >= n {
                    return Err(CsvError("unterminated quoted field".into()));
                }
                if chars[i] == '"' {
                    if i + 1 < n && chars[i + 1] == '"' {
                        field.push('"');
                        i += 2;
                    } else {
                        i += 1;
                        break;
                    }
                } else {
                    field.push(chars[i]);
                    i += 1;
                }
            }
            if i < n && chars[i] != ',' && chars[i] != '\n' && !is_crlf(i) {
                return Err(CsvError(format!("unexpected character after closing quote at offset {i}")));
            }
        } else {
            while i < n && chars[i] != ',' && chars[i] != '\n' && !is_crlf(i) {
                if chars[i] == '"' {
                    return Err(CsvError(format!("quote inside unquoted field at offset {i}")));
                }
                field.push(chars[i]);
                i += 1;
            }
        }
        row.push(field);
        if i >= n {
            rows.push(row);
            break;
        }
        if chars[i] == ',' {
            i += 1;
            continue;
        }
        i += if chars[i] == '\r' { 2 } else { 1 };
        rows.push(std::mem::take(&mut row));
        if i >= n {
            break;
        }
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vector_rows() -> Vec<Vec<&'static str>> {
        vec![
            vec!["id", "name", "note"],
            vec!["1", "Ada, Lovelace", "said \"hi\""],
            vec!["2", "=SUM(A1)", "line1\nline2"],
            vec!["3", " padded", "-5"],
        ]
    }

    #[test]
    fn write_vector() {
        assert_eq!(
            write_csv(&vector_rows(), true),
            "id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n"
        );
        assert_eq!(write_csv(&[["=1"]], false), "=1\r\n");
        assert_eq!(write_csv::<Vec<&str>, &str>(&[], true), "");
    }

    #[test]
    fn parse_vectors() {
        assert_eq!(
            parse_csv("a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n").unwrap(),
            vec![vec!["a", "b"], vec!["x,1", "say \"hi\""], vec!["multi\nline", ""]]
        );
        assert_eq!(parse_csv("\u{FEFF}a\n").unwrap(), vec![vec!["a"]]);
        assert!(parse_csv("").unwrap().is_empty());
        for bad in ["a,\"b", "a\"b", "\"a\"x"] {
            assert!(parse_csv(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn round_trip() {
        let rows = vector_rows();
        let parsed = parse_csv(&write_csv(&rows, false)).unwrap();
        assert_eq!(parsed, rows);
    }
}
