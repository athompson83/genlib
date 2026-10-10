// SPDX-License-Identifier: Apache-2.0

//! Deterministic line diff from a longest common subsequence table, rendered
//! as a valid unified diff (patch reproduces the new text); same format as GNU
//! `diff -u`, which may pick a different alignment of equal size. A last line
//! without a trailing newline only matches another last line without one and
//! is followed by `\ No newline at end of file`. Inputs are limited to
//! 4,000,000 line pairs (the table is quadratic).

use std::fmt;

/// Input too large or invalid option.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DiffError(pub String);

impl fmt::Display for DiffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DiffError {}

/// One diff line: `'='` unchanged, `'-'` removed or `'+'` added.
pub type Op<'a> = (char, &'a str);

/// A split line and whether it is the last line of a text without a final
/// `\n`. Two lines are equal only if both fields are equal.
type Line<'a> = (&'a str, bool);

fn split(t: &str) -> Vec<Line<'_>> {
    if t.is_empty() {
        return vec![];
    }
    let nl = t.ends_with('\n');
    let mut lines: Vec<Line> = t.split('\n').map(|l| (l, false)).collect();
    if nl {
        lines.pop();
    } else if let Some(last) = lines.last_mut() {
        last.1 = true;
    }
    lines
}

fn ops<'a>(a: &[Line<'a>], b: &[Line<'a>]) -> Result<Vec<(char, Line<'a>)>, DiffError> {
    let (n, m) = (a.len(), b.len());
    if (n as u64) * (m as u64) > 4_000_000 {
        return Err(DiffError("input too large (lines(a) * lines(b) > 4,000,000)".into()));
    }
    let mut l = vec![vec![0u32; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            l[i][j] = if a[i] == b[j] { l[i + 1][j + 1] + 1 } else { l[i + 1][j].max(l[i][j + 1]) };
        }
    }
    let (mut i, mut j, mut out) = (0, 0, Vec::with_capacity(n + m));
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            out.push(('=', a[i]));
            i += 1;
            j += 1;
        } else if j >= m || (i < n && l[i + 1][j] >= l[i][j + 1]) {
            out.push(('-', a[i]));
            i += 1;
        } else {
            out.push(('+', b[j]));
            j += 1;
        }
    }
    Ok(out)
}

/// Splits both texts on `\n` (a final `\n` ends the last line; "" has no
/// lines) and returns the operations, preferring removals before additions.
/// A last line without `\n` only matches another such last line.
pub fn diff_lines<'a>(a: &'a str, b: &'a str) -> Result<Vec<Op<'a>>, DiffError> {
    Ok(ops(&split(a), &split(b))?.into_iter().map(|(k, (line, _))| (k, line)).collect())
}

fn range(before: usize, count: usize) -> String {
    match count {
        0 => format!("{before},0"),
        1 => format!("{}", before + 1),
        _ => format!("{},{count}", before + 1),
    }
}

/// "" when the texts are equal, otherwise `--- from`, `+++ to` and hunks with
/// `context` lines around each change: a valid unified diff (patch reproduces
/// the new text); same format as GNU `diff -u`, which may pick a different
/// alignment of equal size.
pub fn unified_diff(a: &str, b: &str, from_name: &str, to_name: &str, context: usize) -> Result<String, DiffError> {
    let rows = ops(&split(a), &split(b))?;
    let context = context.min(rows.len()); // larger values cannot change the output
    let changes: Vec<usize> = rows.iter().enumerate().filter(|(_, r)| r.0 != '=').map(|(k, _)| k).collect();
    let Some(&first) = changes.first() else { return Ok(String::new()) };
    let mut hunks = vec![(first, first)];
    for &k in &changes[1..] {
        let last = hunks.last_mut().expect("hunk");
        if k - last.1 - 1 <= 2 * context {
            last.1 = k;
        } else {
            hunks.push((k, k));
        }
    }
    let mut out = format!("--- {from_name}\n+++ {to_name}\n");
    for (s, e) in hunks {
        let s = s.saturating_sub(context);
        let e = (e + context).min(rows.len() - 1);
        let count = |rs: &[(char, Line)], skip: char| rs.iter().filter(|r| r.0 != skip).count();
        let seg = &rows[s..=e];
        out.push_str(&format!(
            "@@ -{} +{} @@\n",
            range(count(&rows[..s], '+'), count(seg, '+')),
            range(count(&rows[..s], '-'), count(seg, '-'))
        ));
        for &(kind, (line, no_eol)) in seg {
            out.push(if kind == '=' { ' ' } else { kind });
            out.push_str(line);
            out.push('\n');
            if no_eol {
                out.push_str("\\ No newline at end of file\n");
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // ops are written as "=a|-b|+B" for compactness.
    const CASES: [(&str, &str, &str, &str); 15] = [
        ("a\nb\nc\n", "a\nB\nc\n", "=a|-b|+B|=c", "--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
        ("", "x\n", "+x", "--- old.txt\n+++ new.txt\n@@ -0,0 +1 @@\n+x\n"),
        ("x\n", "", "-x", "--- old.txt\n+++ new.txt\n@@ -1 +0,0 @@\n-x\n"),
        ("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n", "=one|-two|+TWO|=three|=four|=five|=six|=seven|=eight|-nine|+NINE|=ten", "--- old.txt\n+++ new.txt\n@@ -1,10 +1,10 @@\n one\n-two\n+TWO\n three\n four\n five\n six\n seven\n eight\n-nine\n+NINE\n ten\n"),
        ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n", "=1|=2|-3|+X|=4|=5|=6|=7|=8|=9|=10|=11|=12|=13|-14|+Y|=15|=16", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -11,6 +11,6 @@\n 11\n 12\n 13\n-14\n+Y\n 15\n 16\n"),
        ("a\nb\n", "a\nb", "=a|-b|+b", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
        ("a\nb", "a\nc", "=a|-b|+c", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n"),
        ("same\n", "same\n", "=same", ""),
        ("a\nb\nc\nd\n", "b\nc\nd\ne\n", "-a|=b|=c|=d|+e", "--- old.txt\n+++ new.txt\n@@ -1,4 +1,4 @@\n-a\n b\n c\n d\n+e\n"),
        ("x\ny\n", "y\nx\n", "-x|=y|+x", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-x\n y\n+x\n"),
        ("a\nb\nd\nd\ne\nc\nb", "c\nd\nc\nd\nb\nb\na\nb\n", "-a|-b|-d|+c|=d|-e|=c|-b|+d|+b|+b|+a|+b", "--- old.txt\n+++ new.txt\n@@ -1,7 +1,8 @@\n-a\n-b\n-d\n+c\n d\n-e\n c\n-b\n\\ No newline at end of file\n+d\n+b\n+b\n+a\n+b\n"),
        ("a\nd\nd\na\nb\na", "b\na\nc\ne\na\na\na\n", "+b|=a|-d|-d|+c|+e|=a|-b|-a|+a|+a", "--- old.txt\n+++ new.txt\n@@ -1,6 +1,7 @@\n+b\n a\n-d\n-d\n+c\n+e\n a\n-b\n-a\n\\ No newline at end of file\n+a\n+a\n"),
        ("x", "x", "=x", ""),
        ("x", "x\n", "-x|+x", "--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+x\n"),
        ("p\nq", "q\np", "-p|-q|+q|+p", "--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-p\n-q\n\\ No newline at end of file\n+q\n+p\n\\ No newline at end of file\n"),
    ];

    #[test]
    fn lines() {
        for (a, b, want, _) in CASES {
            let want: Vec<Op> = want.split('|').map(|s| (s.chars().next().unwrap(), &s[1..])).collect();
            assert_eq!(diff_lines(a, b), Ok(want), "{a:?} {b:?}");
        }
    }

    #[test]
    fn unified() {
        for (a, b, _, want) in CASES {
            assert_eq!(unified_diff(a, b, "old.txt", "new.txt", 3).as_deref(), Ok(want), "{a:?} {b:?}");
        }
    }

    #[test]
    fn limit() {
        let big = "x\n".repeat(2001);
        assert!(diff_lines(&big, &big).is_err());
    }
}
