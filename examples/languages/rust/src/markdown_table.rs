// SPDX-License-Identifier: Apache-2.0

//! GitHub-flavored Markdown tables.
//!
//! Cells escape `\` and `|` and turn CRLF, CR and LF into `<br>`. Each column
//! is as wide as its longest escaped cell in code points (at least 3); cells
//! are padded according to the column alignment (`"left"`, `"right"`,
//! `"center"` or `""` for none) and the separator row carries the colons.
//! Lines are joined with `\n` and have no trailing newline.

use std::fmt;

/// Empty headers, a row of the wrong width or an unknown alignment.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TableError(pub String);

impl fmt::Display for TableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "markdown table: {}", self.0)
    }
}

impl std::error::Error for TableError {}

fn err<T>(m: &str) -> Result<T, TableError> {
    Err(TableError(m.to_string()))
}

fn escape(c: &str) -> String {
    c.replace('\\', "\\\\")
        .replace('|', "\\|")
        .replace("\r\n", "<br>")
        .replace(['\r', '\n'], "<br>")
}

fn pad(s: &str, w: usize, a: &str) -> String {
    let gap = w - s.chars().count();
    match a {
        "right" => format!("{}{s}", " ".repeat(gap)),
        "center" => format!("{}{s}{}", " ".repeat(gap / 2), " ".repeat(gap - gap / 2)),
        _ => format!("{s}{}", " ".repeat(gap)),
    }
}

fn sep(w: usize, a: &str) -> String {
    let mut d = vec!['-'; w];
    if a == "left" || a == "center" {
        d[0] = ':';
    }
    if a == "right" || a == "center" {
        d[w - 1] = ':';
    }
    d.into_iter().collect()
}

fn line(cells: Vec<String>) -> String {
    format!("| {} |", cells.join(" | "))
}

/// Renders `headers` and `rows`; `align` is `None` (no colons) or one of
/// `"left"`, `"right"`, `"center"` or `""` per column.
pub fn markdown_table<S: AsRef<str>>(
    headers: &[S],
    rows: &[Vec<S>],
    align: Option<&[&str]>,
) -> Result<String, TableError> {
    let n = headers.len();
    if n == 0 {
        return err("headers must not be empty");
    }
    let default = vec![""; n];
    let align = match align {
        Some(a) if !a.is_empty() => a,
        _ => &default[..],
    };
    if align.len() != n
        || align
            .iter()
            .any(|a| !["", "left", "right", "center"].contains(a))
    {
        return err("align must give left, right, center or none per column");
    }
    if rows.iter().any(|r| r.len() != n) {
        return err("every row needs one cell per header");
    }
    let cells: Vec<Vec<String>> = std::iter::once(headers)
        .chain(rows.iter().map(|r| r.as_slice()))
        .map(|r| r.iter().map(|c| escape(c.as_ref())).collect())
        .collect();
    let widths: Vec<usize> = (0..n)
        .map(|i| {
            cells
                .iter()
                .map(|r| r[i].chars().count())
                .max()
                .unwrap_or(0)
                .max(3)
        })
        .collect();
    let render = |r: &Vec<String>| {
        line(
            r.iter()
                .enumerate()
                .map(|(i, c)| pad(c, widths[i], align[i]))
                .collect(),
        )
    };
    let mut out = vec![
        render(&cells[0]),
        line((0..n).map(|i| sep(widths[i], align[i])).collect()),
    ];
    out.extend(cells[1..].iter().map(render));
    Ok(out.join("\n"))
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn table_vectors() {
        assert_eq!(
            markdown_table(
                &["Name", "Qty"],
                &vec![vec!["Apple", "3"], vec!["Kiwi", "12"]],
                None
            )
            .as_deref(),
            Ok("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |")
        );
        assert_eq!(
            markdown_table(
                &["a", "b", "c"],
                &vec![vec!["1", "2", "3"]],
                Some(&["left", "right", "center"][..])
            )
            .as_deref(),
            Ok("| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |")
        );
        assert_eq!(
            markdown_table(&["Pipe|col", "Text"], &vec![vec!["a|b", "line1\nline2"], vec!["back\\slash", "crlf\r\nx"]], None).as_deref(),
            Ok("| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |")
        );
        assert_eq!(
            markdown_table(&["x"], &Vec::<Vec<&str>>::new(), Some(&["center"][..])).as_deref(),
            Ok("|  x  |\n| :-: |")
        );
        assert_eq!(
            markdown_table(
                &["Caf\u{e9}", "\u{1f600}"],
                &vec![vec!["na\u{ef}ve", "ok"]],
                Some(&["right", ""][..])
            )
            .as_deref(),
            Ok("|  Caf\u{e9} | \u{1f600}   |\n| ----: | --- |\n| na\u{ef}ve | ok  |")
        );
        assert_eq!(
            markdown_table(&["wide"], &vec![vec!["abcdefghij"]], Some(&["center"][..])).as_deref(),
            Ok("|    wide    |\n| :--------: |\n| abcdefghij |")
        );
        assert_eq!(
            markdown_table(&["a"], &[vec!["1"]], Some(&[][..])).as_deref(),
            Ok("| a   |\n| --- |\n| 1   |")
        );
    }

    #[test]
    fn table_invalid() {
        assert!(markdown_table::<&str>(&[], &Vec::<Vec<&str>>::new(), None).is_err());
        assert!(markdown_table::<&str>(&["a", "b"], &vec![vec!["1"]], None).is_err());
        assert!(markdown_table::<&str>(&["a"], &vec![vec!["1"]], Some(&["middle"][..])).is_err());
    }
}
