// SPDX-License-Identifier: Apache-2.0

//! Minimal line diff (a shortest edit script) rendered as a valid unified
//! diff: patch reproduces the new text. The output usually equals GNU
//! `diff -u` (about 95% of small random inputs) but that is not guaranteed;
//! another alignment of equal size may be chosen.
//!
//! Algorithm: lines that occur nowhere in the other text are marked changed
//! first; Myers' linear-space middle-snake recursion (Myers 1986, section 4b)
//! runs on the remaining lines; each run of changes then slides down while
//! the line after it equals its first line, and a run of one side's changes
//! moves up through equal lines when that places it beside the other side's
//! changes. Time is O((N+M)·D) and memory O(N+M). Inputs are limited to
//! 1,000,000 lines in total.
//!
//! A last line without a trailing newline only matches another last line
//! without one and is followed by `\ No newline at end of file`.

use std::collections::HashMap;
use std::fmt;

/// The largest total number of lines (both texts) accepted.
pub const MAX_LINES: usize = 1_000_000;

/// Input too large.
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

/// A middle snake from (x, y) to (u, v) of the box `a[a0..a1]` x `b[b0..b1]`.
fn middle_snake(a: &[usize], b: &[usize], a0: usize, a1: usize, b0: usize, b1: usize) -> (usize, usize, usize, usize) {
    let (n, m) = ((a1 - a0) as isize, (b1 - b0) as isize);
    let delta = n - m;
    let odd = delta & 1 != 0;
    let off = n + m + 1;
    // vf[off + k]: furthest x on diagonal k (x - y = k); vb the same on the reversed sequences.
    let mut vf = vec![0isize; (2 * off + 1) as usize];
    let mut vb = vec![0isize; (2 * off + 1) as usize];
    let ix = |k: isize| (off + k) as usize;
    for d in 0..=(n + m + 1) / 2 {
        let mut k = -d;
        while k <= d {
            // forward
            let mut x = if k == -d || (k != d && vf[ix(k - 1)] < vf[ix(k + 1)]) { vf[ix(k + 1)] } else { vf[ix(k - 1)] + 1 };
            let mut y = x - k;
            let (sx, sy) = (x, y);
            while x < n && y < m && a[a0 + x as usize] == b[b0 + y as usize] {
                x += 1;
                y += 1;
            }
            vf[ix(k)] = x;
            if odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[ix(delta - k)] >= n {
                return (a0 + sx as usize, b0 + sy as usize, a0 + x as usize, b0 + y as usize);
            }
            k += 2;
        }
        let mut k = -d;
        while k <= d {
            // backward, on reversed sequences
            let mut x = if k == -d || (k != d && vb[ix(k - 1)] < vb[ix(k + 1)]) { vb[ix(k + 1)] } else { vb[ix(k - 1)] + 1 };
            let mut y = x - k;
            let (sx, sy) = (x, y);
            while x < n && y < m && a[a1 - 1 - x as usize] == b[b1 - 1 - y as usize] {
                x += 1;
                y += 1;
            }
            vb[ix(k)] = x;
            if !odd && -d <= delta - k && delta - k <= d && x + vf[ix(delta - k)] >= n {
                return (a1 - x as usize, b1 - y as usize, a1 - sx as usize, b1 - sy as usize);
            }
            k += 2;
        }
    }
    unreachable!("no middle snake")
}

#[allow(clippy::too_many_arguments)]
fn compare(a: &[usize], b: &[usize], mut a0: usize, mut a1: usize, mut b0: usize, mut b1: usize, ca: &mut [bool], cb: &mut [bool]) {
    while a0 < a1 && b0 < b1 && a[a0] == b[b0] {
        a0 += 1;
        b0 += 1;
    }
    while a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1] {
        a1 -= 1;
        b1 -= 1;
    }
    if a0 == a1 {
        cb[b0..b1].iter_mut().for_each(|c| *c = true);
        return;
    }
    if b0 == b1 {
        ca[a0..a1].iter_mut().for_each(|c| *c = true);
        return;
    }
    let (x, y, u, v) = middle_snake(a, b, a0, a1, b0, b1);
    compare(a, b, a0, x, b0, y, ca, cb);
    compare(a, b, u, a1, v, b1, ca, cb);
}

/// Moves each run of changed lines down while the line after it equals its first line.
fn slide(lines: &[usize], changed: &mut [bool]) {
    let (mut i, n) = (0, lines.len());
    while i < n {
        if !changed[i] {
            i += 1;
            continue;
        }
        let mut j = i;
        while j < n && changed[j] {
            j += 1;
        }
        while j < n && lines[i] == lines[j] {
            changed[i] = false;
            changed[j] = true;
            i += 1;
            j += 1;
            while j < n && changed[j] {
                j += 1; // merged with the next run
            }
        }
        i = j;
    }
}

/// Equal line pairs (i, j) in order.
fn pairs(ca: &[bool], cb: &[bool]) -> Vec<(usize, usize)> {
    let (mut out, mut i, mut j) = (vec![], 0, 0);
    while i < ca.len() || j < cb.len() {
        if i < ca.len() && ca[i] {
            i += 1;
        } else if j < cb.len() && cb[j] {
            j += 1;
        } else {
            out.push((i, j));
            i += 1;
            j += 1;
        }
    }
    out
}

/// One bottom-up pass: slides a run of changed x lines up through equal lines
/// (into gaps with no changed x lines) when that places it next to changed
/// lines of the other file, so the hunk shows a replacement instead of a
/// deletion and an insertion apart.
fn align(x: &[usize], cx: &mut [bool], cy: &[bool], swap: bool) {
    let e: Vec<(usize, usize)> = if swap { pairs(cy, cx).into_iter().map(|(p, q)| (q, p)).collect() } else { pairs(cx, cy) };
    // Indexes are shifted by one so that -1 ("before the first line") is 0.
    let xb: Vec<usize> = std::iter::once(0).chain(e.iter().map(|p| p.0 + 1)).collect(); // x index + 1 of the pair above gap g
    let yb: Vec<usize> = std::iter::once(0).chain(e.iter().map(|p| p.1 + 1)).chain(std::iter::once(cy.len() + 1)).collect();
    let xe: Vec<usize> = e.iter().map(|p| p.0).chain(std::iter::once(cx.len())).collect(); // gap g holds x lines xb[g] .. xe[g]-1
    let mut g = e.len();
    while g >= 1 {
        let (x0, x1) = (xb[g], xe[g]);
        if x1 > x0 && yb[g + 1] - yb[g] == 1 {
            // a run of x changes with no other-file change beside it
            let (mut h, mut top, mut last) = (g, x0, x1 - 1);
            while h >= 1 && top >= 1 && xb[h] == top && x[top - 1] == x[last] {
                // the run now sits in gap h
                h -= 1;
                top -= 1;
                last -= 1;
                if yb[h + 1] - yb[h] > 1 {
                    // other-file changes here: move the run
                    cx[top..x0].iter_mut().for_each(|c| *c = true);
                    cx[last + 1..x1].iter_mut().for_each(|c| *c = false);
                    g = h;
                    break;
                }
                if h >= 1 && xe[h] + 1 - xb[h] > 1 {
                    break; // would merge with another x run
                }
            }
        }
        if g == 0 {
            break; // the run moved into gap 0
        }
        g -= 1;
    }
}

fn ops<'a>(a: &[Line<'a>], b: &[Line<'a>]) -> Result<Vec<(char, Line<'a>)>, DiffError> {
    if a.len() + b.len() > MAX_LINES {
        return Err(DiffError("diff input too large (more than 1,000,000 lines)".into()));
    }
    // Intern lines so that comparisons are integer comparisons.
    let mut ids: HashMap<Line<'a>, usize> = HashMap::new();
    let mut intern = |ls: &[Line<'a>]| -> Vec<usize> {
        ls.iter()
            .map(|l| {
                let next = ids.len();
                *ids.entry(*l).or_insert(next)
            })
            .collect()
    };
    let (ia, ib) = (intern(a), intern(b));
    let mut in_a = vec![false; ids.len()];
    let mut in_b = vec![false; ids.len()];
    ia.iter().for_each(|&id| in_a[id] = true);
    ib.iter().for_each(|&id| in_b[id] = true);
    // A line that never occurs in the other file is in no common subsequence:
    // mark it changed and run Myers only on the remaining lines (the result
    // stays minimal).
    let mut ca: Vec<bool> = ia.iter().map(|&id| !in_b[id]).collect();
    let mut cb: Vec<bool> = ib.iter().map(|&id| !in_a[id]).collect();
    let ka: Vec<usize> = (0..a.len()).filter(|&i| !ca[i]).collect();
    let kb: Vec<usize> = (0..b.len()).filter(|&j| !cb[j]).collect();
    let fa: Vec<usize> = ka.iter().map(|&i| ia[i]).collect();
    let fb: Vec<usize> = kb.iter().map(|&j| ib[j]).collect();
    let (mut sa, mut sb) = (vec![false; fa.len()], vec![false; fb.len()]);
    compare(&fa, &fb, 0, fa.len(), 0, fb.len(), &mut sa, &mut sb);
    ka.iter().zip(&sa).for_each(|(&i, &s)| ca[i] = s);
    kb.iter().zip(&sb).for_each(|(&j, &s)| cb[j] = s);
    slide(&ia, &mut ca);
    slide(&ib, &mut cb);
    align(&ia, &mut ca, &cb, false);
    align(&ib, &mut cb, &ca, true);
    let (mut i, mut j, mut out) = (0, 0, Vec::with_capacity(a.len() + b.len()));
    while i < a.len() || j < b.len() {
        if i < a.len() && ca[i] {
            out.push(('-', a[i]));
            i += 1;
        } else if j < b.len() && cb[j] {
            out.push(('+', b[j]));
            j += 1;
        } else {
            out.push(('=', a[i]));
            i += 1;
            j += 1;
        }
    }
    Ok(out)
}

/// Splits both texts on `\n` (a final `\n` ends the last line; "" has no
/// lines) and returns a minimal list of operations. A last line without `\n`
/// only matches another such last line.
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
/// `context` lines around each change (hunks join when the gap is at most
/// 2·context lines): a valid unified diff (patch reproduces the new text),
/// usually but not always identical to GNU `diff -u`.
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
    let count = |rs: &[(char, Line)], skip: char| rs.iter().filter(|r| r.0 != skip).count();
    let (mut a_before, mut b_before, mut pos) = (0, 0, 0);
    for (s, e) in hunks {
        let s = s.saturating_sub(context);
        let e = (e + context).min(rows.len() - 1);
        a_before += count(&rows[pos..s], '+');
        b_before += count(&rows[pos..s], '-');
        pos = s;
        let seg = &rows[s..=e];
        out.push_str(&format!("@@ -{} +{} @@\n", range(a_before, count(seg, '+')), range(b_before, count(seg, '-'))));
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
    use std::time::{Duration, Instant};

    #[test]
    fn unified_vectors() {
        for (a, b, context, want) in UNIFIED {
            assert_eq!(unified_diff(a, b, "a", "b", context).as_deref(), Ok(want), "{a:?} {b:?} {context}");
        }
    }

    #[test]
    fn lines_vectors() {
        for (a, b, want) in LINES {
            assert_eq!(diff_lines(a, b), Ok(want.to_vec()), "{a:?} {b:?}");
        }
    }

    fn numbered(prefix: &str, n: usize) -> Vec<String> {
        (0..n).map(|i| format!("{prefix}{i}")).collect()
    }

    #[test]
    fn large_input_is_fast() {
        let a = numbered("line ", 100_000);
        let mut b = a.clone();
        for k in 0..20 {
            b[k * 4999 + 17] = format!("edited {k}");
        }
        let (ta, tb) = (a.join("\n") + "\n", b.join("\n") + "\n");
        let start = Instant::now();
        let ops = diff_lines(&ta, &tb).expect("diff");
        assert!(start.elapsed() < Duration::from_secs(10), "took {:?}", start.elapsed());
        assert_eq!(ops.iter().filter(|o| o.0 != '=').count(), 40);
    }

    #[test]
    fn no_common_line() {
        let (a, b) = (numbered("a", 3000).join("\n") + "\n", numbered("b", 3000).join("\n") + "\n");
        let ops = diff_lines(&a, &b).expect("diff");
        assert_eq!(ops.iter().filter(|o| o.0 == '-').count(), 3000);
        assert_eq!(ops.iter().filter(|o| o.0 == '+').count(), 3000);
        assert_eq!(ops.len(), 6000);
    }

    #[test]
    fn limit() {
        let big = "x\n".repeat(MAX_LINES / 2);
        assert!(diff_lines(&big, &(big.clone() + "y\n")).is_err());
    }

    /// Applies a unified diff produced by `unified_diff` to `a`.
    fn patch(a: &str, diff: &str) -> String {
        if diff.is_empty() {
            return a.to_string();
        }
        let src = split(a);
        let rows: Vec<&str> = diff.trim_end_matches('\n').split('\n').skip(2).collect();
        let (mut out, mut pos): (Vec<Line>, usize) = (vec![], 0);
        for (k, r) in rows.iter().enumerate() {
            if let Some(rest) = r.strip_prefix("@@ -") {
                let old = rest.split(' ').next().expect("range");
                let start: usize = old.split(',').next().expect("start").parse().expect("number");
                let first = if old.ends_with(",0") { start } else { start - 1 };
                out.extend_from_slice(&src[pos..first]);
                pos = first;
                continue;
            }
            let no_eol = rows.get(k + 1).is_some_and(|n| n.starts_with('\\'));
            match r.as_bytes().first() {
                Some(b' ') => {
                    out.push(src[pos]);
                    pos += 1;
                }
                Some(b'-') => pos += 1,
                Some(b'+') => out.push((&r[1..], no_eol)),
                _ => {}
            }
        }
        out.extend_from_slice(&src[pos..]);
        out.iter().map(|(t, no_eol)| if *no_eol { t.to_string() } else { format!("{t}\n") }).collect()
    }

    #[test]
    fn patch_round_trip() {
        for (a, b, context, _) in UNIFIED {
            let d = unified_diff(a, b, "a", "b", context).expect("diff");
            assert_eq!(patch(a, &d), b, "{a:?} {b:?}");
        }
    }

    // Test vectors copied verbatim from the shared Genlib capability vectors.
    const UNIFIED: [(&str, &str, usize, &str); 88] = [
        ("", "", 3, ""),
        ("", "", 0, ""),
        ("", "", 1, ""),
        ("a\n", "a\n", 3, ""),
        ("a\n", "a\n", 0, ""),
        ("a\n", "a\n", 1, ""),
        ("", "a\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
        ("", "a\n", 0, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
        ("", "a\n", 1, "--- a\n+++ b\n@@ -0,0 +1 @@\n+a\n"),
        ("a\n", "", 3, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
        ("a\n", "", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
        ("a\n", "", 1, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n"),
        ("a\nb\nc\n", "a\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
        ("a\nb\nc\n", "a\nc\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-b\n"),
        ("a\nb\nc\n", "a\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-b\n c\n"),
        ("a\nb\nc\n", "a\nB\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
        ("a\nb\nc\n", "a\nB\nc\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+B\n"),
        ("a\nb\nc\n", "a\nB\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n"),
        ("a\nb", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
        ("a\nb", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n\\ No newline at end of file\n+b\n"),
        ("a\nb", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n"),
        ("a\nb\n", "a\nb", 3, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
        ("a\nb\n", "a\nb", 0, "--- a\n+++ b\n@@ -2 +2 @@\n-b\n+b\n\\ No newline at end of file\n"),
        ("a\nb\n", "a\nb", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n"),
        ("x", "y", 3, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
        ("x", "y", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
        ("x", "y", 1, "--- a\n+++ b\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n\\ No newline at end of file\n"),
        ("a\n\nb\n", "a\nb\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
        ("a\n\nb\n", "a\nb\n", 0, "--- a\n+++ b\n@@ -2 +1,0 @@\n-\n"),
        ("a\n\nb\n", "a\nb\n", 1, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n a\n-\n b\n"),
        ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 3, "--- a\n+++ b\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -8,5 +8,5 @@\n 8\n 9\n 10\n-11\n+Y\n 12\n"),
        ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 0, "--- a\n+++ b\n@@ -3 +3 @@\n-3\n+X\n@@ -11 +11 @@\n-11\n+Y\n"),
        ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", 1, "--- a\n+++ b\n@@ -2,3 +2,3 @@\n 2\n-3\n+X\n 4\n@@ -10,3 +10,3 @@\n 10\n-11\n+Y\n 12\n"),
        ("a\nb\na\nb\n", "b\na\nb\na\n", 3, "--- a\n+++ b\n@@ -1,4 +1,4 @@\n-a\n b\n a\n b\n+a\n"),
        ("a\nb\na\nb\n", "b\na\nb\na\n", 0, "--- a\n+++ b\n@@ -1 +0,0 @@\n-a\n@@ -4,0 +4 @@\n+a\n"),
        ("a\nb\na\nb\n", "b\na\nb\na\n", 1, "--- a\n+++ b\n@@ -1,2 +1 @@\n-a\n b\n@@ -4 +3,2 @@\n b\n+a\n"),
        ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-line 5\n+}\n line 5\n line 4\n"),
        ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 0, "--- a\n+++ b\n@@ -1 +1 @@\n-line 5\n+}\n"),
        ("line 5\nline 5\nline 4\n", "}\nline 5\nline 4\n", 1, "--- a\n+++ b\n@@ -1,2 +1,2 @@\n-line 5\n+}\n line 5\n"),
        ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,4 +1,7 @@\n {\n }\n {\n+x\n }\n+{\n+}\n"),
        ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 0, "--- a\n+++ b\n@@ -3,0 +4 @@\n+x\n@@ -4,0 +6,2 @@\n+{\n+}\n"),
        ("{\n}\n{\n}\n", "{\n}\n{\nx\n}\n{\n}\n", 1, "--- a\n+++ b\n@@ -3,2 +3,5 @@\n {\n+x\n }\n+{\n+}\n"),
        ("same\nsame\nsame\n", "same\nsame\n", 3, "--- a\n+++ b\n@@ -1,3 +1,2 @@\n same\n same\n-same\n"),
        ("same\nsame\nsame\n", "same\nsame\n", 0, "--- a\n+++ b\n@@ -3 +2,0 @@\n-same\n"),
        ("same\nsame\nsame\n", "same\nsame\n", 1, "--- a\n+++ b\n@@ -2,2 +2 @@\n same\n-same\n"),
        ("p\nq\nr\n", "a\nb\nc\n", 3, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
        ("p\nq\nr\n", "a\nb\nc\n", 0, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
        ("p\nq\nr\n", "a\nb\nc\n", 1, "--- a\n+++ b\n@@ -1,3 +1,3 @@\n-p\n-q\n-r\n+a\n+b\n+c\n"),
        ("line 0\nline 4\nline 3\nline 3\nline 2\nline 1\n    return x\n", "line 4\nline 2\n{\nline 1\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,5 @@\n-line 0\n line 4\n-line 3\n-line 3\n line 2\n+{\n line 1\n-    return x\n+line 3\n"),
        ("    return x\nline 2\nline 0\nline 0\n\nline 0\nline 2\n    return x\nline 2\n}\nline 2\n    return x\nline 0\n", "    return x\nline 2\nline 0\nline 0\nline 0\nline 2\n    return x\nline 2\n}\n}\nline 2\n    return x\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -2,12 +2,13 @@\n line 2\n line 0\n line 0\n-\n line 0\n line 2\n     return x\n line 2\n }\n+}\n line 2\n     return x\n+{\n line 0\n"),
        ("line 2\nline 5\nline 5\nline 3\n{\nline 4\n    return x\n{\n{\nline 1\n}\n{\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n", "line 2\nline 3\nline 5\nline 5\nline 3\n{\n    return x\n{\n{\nline 1\n}\nline 5\nline 2\n\n    return x\nline 3\nline 2\nline 7\nline 6\nline 4\n{\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,15 +1,15 @@\n line 2\n+line 3\n line 5\n line 5\n line 3\n {\n-line 4\n     return x\n {\n {\n line 1\n }\n-{\n+line 5\n line 2\n \n     return x\n@@ -20,3 +20,4 @@\n line 4\n {\n     return x\n+\n"),
        ("line 3\n    return x\n\nline 6\n    return x\n\nline 2\nline 4\nline 2\nline 3\n}\n}\nline 4\n{\nline 6\n{\nline 6\nline 5\nline 3\nline 2\n", "line 3\nline 1\n    return x\nline 0\nline 6\n\nline 2\nline 4\nline 2\nline 3\n}\n}\n{\n{\n}\nline 6\n{\nline 4\nline 5\nline 3\nline 2\n", 3, "--- a\n+++ b\n@@ -1,8 +1,8 @@\n line 3\n+line 1\n     return x\n-\n+line 0\n line 6\n-    return x\n \n line 2\n line 4\n@@ -10,11 +10,12 @@\n line 3\n }\n }\n-line 4\n {\n+{\n+}\n line 6\n {\n-line 6\n+line 4\n line 5\n line 3\n line 2\n"),
        ("line 2\n    return x\nline 0\n\nline 2\nline 1\n\nline 3\nline 2\n}\nline 2\nline 0\n}\n    return x\nline 0\nline 1\n}\n\nline 3\nline 0\nline 3\nline 1\nline 1\n    return x\nline 1\nline 2\nline 2\n", "    return x\nline 0\n\nline 2\nline 1\n\nline 2\n}\nline 2\nline 0\n}\n    return x\n    return x\nline 0\nline 1\n}\n\nline 3\n{\nline 0\nline 3\nline 1\n    return x\nline 1\nline 2\nline 2\n", 3, "--- a\n+++ b\n@@ -1,26 +1,25 @@\n-line 2\n     return x\n line 0\n \n line 2\n line 1\n \n-line 3\n line 2\n }\n line 2\n line 0\n }\n     return x\n+    return x\n line 0\n line 1\n }\n \n line 3\n+{\n line 0\n line 3\n line 1\n-line 1\n     return x\n line 1\n line 2\n"),
        ("", "line 1\n", 3, "--- a\n+++ b\n@@ -0,0 +1 @@\n+line 1\n"),
        ("line 0\n{\nline 1\n\n    return x\n}\nline 1\n{\nline 1\n    return x\n{\n{\n}\nline 1\n}\n}\nline 1\nline 0\nline 0\n    return x\n}\n", "line 0\nline 0\nline 1\n\n    return x\n}\n{\nline 1\n    return x\nline 0\n{\n{\n}\nline 1\n    return x\n}\n}\nline 1\nline 0\nline 0\n}\n", 3, "--- a\n+++ b\n@@ -1,21 +1,21 @@\n line 0\n-{\n+line 0\n line 1\n \n     return x\n }\n-line 1\n {\n line 1\n     return x\n+line 0\n {\n {\n }\n line 1\n+    return x\n }\n }\n line 1\n line 0\n line 0\n-    return x\n }\n"),
        ("\nline 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\n}\n    return x\nline 0\nline 0\n    return x", "line 1\n    return x\nline 0\n\n    return x\n    return x\n    return x\n}\nline 0\nline 0\n{\nline 0\n}\n    return x\nline 0\n    return x\n", 3, "--- a\n+++ b\n@@ -1,4 +1,3 @@\n-\n line 1\n     return x\n line 0\n@@ -10,8 +9,8 @@\n line 0\n line 0\n {\n+line 0\n }\n     return x\n line 0\n-line 0\n-    return x\n\\ No newline at end of file\n+    return x\n"),
        ("line 4\nline 6\n    return x\n    return x\n\n{\n    return x\nline 7\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1\n", "line 4\nline 6\n    return x\n\n{\n    return x\nline 7\nline 6\nline 2\nline 3\nline 4\nline 3\nline 0\n}\n    return x\n\nline 0\n    return x\nline 5\nline 0\nline 0\n}\nline 7\n\n\nline 2\nline 0\n\nline 1", 3, "--- a\n+++ b\n@@ -1,11 +1,11 @@\n line 4\n line 6\n     return x\n-    return x\n \n {\n     return x\n line 7\n+line 6\n line 2\n line 3\n line 4\n@@ -26,4 +26,4 @@\n line 2\n line 0\n \n-line 1\n+line 1\n\\ No newline at end of file\n"),
        ("}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 2\n    return x\nline 0\nline 0\n\n}\n}\nline 0\nline 0\n}\nline 1\n}\nline 2\nline 1", "}\nline 0\n}\nline 0\n\n{\n}\n}\n}\nline 2\nline 2\nline 1\n{\n{\nline 2\nline 1\nline 2\n\nline 1\n{\n{\nline 2\n\nline 1\n    return x\nline 0\nline 0\n\n}\nline 0\nline 0\n}\nline 1\nline 0\n}\nline 2\nline 2\nline 1\n", 3, "--- a\n+++ b\n@@ -21,17 +21,18 @@\n {\n line 2\n \n-line 2\n+line 1\n     return x\n line 0\n line 0\n \n }\n-}\n line 0\n line 0\n }\n line 1\n+line 0\n }\n line 2\n-line 1\n\\ No newline at end of file\n+line 2\n+line 1\n"),
        ("line 0\nline 0\n{\n}\nline 1\nline 2\nline 2\n}\nline 1\n{\nline 2\nline 1\n{\n{\n    return x\nline 2\n", "line 0\nline 0\nline 0\nline 0\nline 1\nline 2\nline 2\nline 0\nline 1\n}\nline 1\n}\n{\nline 2\nline 1\n{\n{\n    return x\n{\nline 2\n", 3, "--- a\n+++ b\n@@ -1,16 +1,20 @@\n line 0\n line 0\n-{\n-}\n+line 0\n+line 0\n line 1\n line 2\n line 2\n+line 0\n+line 1\n }\n line 1\n+}\n {\n line 2\n line 1\n {\n {\n     return x\n+{\n line 2\n"),
        ("\nline 0\n\nline 1\n    return x\nline 1\n    return x\nline 0\n\n{\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", "\nline 0\n\nline 1\n    return x\nline 1\n    return x\n    return x\n\n{\n}\n}\n{\n    return x\nline 1\nline 1\nline 1\nline 1\n}\nline 0\n", 3, "--- a\n+++ b\n@@ -5,10 +5,11 @@\n     return x\n line 1\n     return x\n-line 0\n+    return x\n \n {\n }\n+}\n {\n     return x\n line 1\n"),
        ("line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n\n", "line 0\n}\nline 1\nline 1\n}\n\n\nline 1\nline 1\nline 0\n    return x\nline 1\n}\n\n\nline 0\n\n\n    return x\n{\n}\n    return x\n{\n", 3, "--- a\n+++ b\n@@ -21,4 +21,3 @@\n }\n     return x\n {\n-\n"),
        ("line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", "line 2\nline 0\nline 0\n}\n\nline 2\n{\n    return x\nline 2\n\n}\n}\nline 0\n\n}\nline 1\nline 2\nline 0\n{\n}\n\nline 0\n}\n    return x\n}\n{\n{\n{\n{\n{\nline 1\nline 2\n\nline 0\n{\nline 2\n}\nline 2\n", 3, "--- a\n+++ b\n@@ -17,6 +17,7 @@\n line 2\n line 0\n {\n+}\n \n line 0\n }\n"),
        ("    return x\nline 2\nline 3\n}\n}\nline 2\nline 4\n}\n    return x\nline 0\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", "    return x\nline 2\nline 3\n}\n}\nline 1\nline 2\n}\n    return x\nline 4\nline 4\nline 3\n}\n\n{\n{\n{\n", 3, "--- a\n+++ b\n@@ -3,11 +3,10 @@\n line 3\n }\n }\n+line 1\n line 2\n-line 4\n }\n     return x\n-line 0\n line 4\n line 4\n line 3\n"),
        ("line 0\nline 0\nline 1\n\n}\n    return x\n    return x\nline 0\n\n", "    return x\nline 0\nline 0\n}\n}\n    return x\nline 0\n    return x\n\n", 3, "--- a\n+++ b\n@@ -1,9 +1,9 @@\n+    return x\n line 0\n line 0\n-line 1\n-\n }\n-    return x\n+}\n     return x\n line 0\n+    return x\n \n"),
        ("line 7\nline 2\nline 7\n{\n\n\n}\n", "line 7\nline 2\nline 7\n\nline 3\nline 7\n\n    return x\n", 3, "--- a\n+++ b\n@@ -1,7 +1,8 @@\n line 7\n line 2\n line 7\n-{\n \n+line 3\n+line 7\n \n-}\n+    return x\n"),
        ("line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6", "line 7\n{\nline 3\nline 4\nline 7\nline 1\n    return x\nline 4\nline 3\nline 4\nline 5\nline 5\n\nline 1\nline 2\nline 2\nline 3\nline 6\n    return x\nline 2\n    return x\nline 3\nline 1\nline 6\nline 6\nline 5\n\nline 7\nline 6\nline 0\nline 3\nline 6\nline 6\n", 3, "--- a\n+++ b\n@@ -30,4 +30,4 @@\n line 0\n line 3\n line 6\n-line 6\n\\ No newline at end of file\n+line 6\n"),
        ("line 0\n\nline 4\n}\n}\n    return x\n    return x\nline 3\n{\nline 3\nline 4\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 2\n{\nline 2\nline 0\n", "line 0\n\nline 4\n}\n}\n    return x\nline 3\n{\nline 3\nline 4\n}\n}\n{\nline 0\n}\n\n}\nline 2\n{\nline 2\n    return x\nline 0\n}\nline 0\nline 1\n}\nline 1\n{\nline 2\nline 0\n", 3, "--- a\n+++ b\n@@ -4,12 +4,12 @@\n }\n }\n     return x\n-    return x\n line 3\n {\n line 3\n line 4\n }\n+}\n {\n line 0\n }\n@@ -24,7 +24,7 @@\n line 0\n line 1\n }\n-line 2\n+line 1\n {\n line 2\n line 0\n"),
        ("line 1\n    return x\nline 0\n    return x\nline 0\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\n", "line 1\n    return x\nline 0\n    return x\nline 0\n\nline 0\nline 1\nline 1\nline 0\n{\nline 1\nline 1\nline 1\n}\n    return x\nline 0\n{\nline 1\n}\n    return x\n\n\nline 0\n", 3, "--- a\n+++ b\n@@ -3,6 +3,7 @@\n line 0\n     return x\n line 0\n+\n line 0\n line 1\n line 1\n@@ -20,3 +21,4 @@\n     return x\n \n \n+line 0\n"),
        ("{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\n    return x\nline 1\n{\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n\n}\nline 3\nline 1\n\n    return x\nline 3\n    return x\n", "{\n{\nline 3\nline 1\nline 3\nline 1\n\nline 1\nline 0\n}\n{\n}\nline 1\n}\nline 0\n{\nline 1\n}\n    return x\nline 2\n{\nline 2\n\n    return x\n    return x\n{\n}\nline 3\nline 2\n    return x\nline 3\n    return x\nline 3\n", 3, "--- a\n+++ b\n@@ -14,9 +14,7 @@\n }\n line 0\n {\n-    return x\n line 1\n-{\n }\n     return x\n line 2\n@@ -26,11 +24,10 @@\n     return x\n     return x\n {\n-\n }\n line 3\n-line 1\n-\n+line 2\n     return x\n line 3\n     return x\n+line 3\n"),
        ("    return x\n\n\nline 0\nline 1\nline 4\nline 3\nline 6\nline 3\nline 4\n    return x\n{\nline 5\n\n}\n}\nline 5\nline 6\n}\nline 5\nline 5\n\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", "    return x\n\n\nline 1\nline 4\nline 2\nline 6\nline 4\nline 4\n{\nline 5\n\n}\nline 5\nline 6\n}\nline 5\nline 4\nline 4\nline 4\nline 3\nline 1\nline 3\nline 5\nline 1\n", 3, "--- a\n+++ b\n@@ -1,25 +1,20 @@\n     return x\n \n \n-line 0\n line 1\n line 4\n-line 3\n+line 2\n line 6\n-line 3\n line 4\n-    return x\n+line 4\n {\n line 5\n \n }\n-}\n line 5\n line 6\n }\n line 5\n-line 5\n-\n line 4\n line 4\n line 4\n"),
        ("\n    return x\nline 1\n    return x\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n    return x\nline 0\nline 1\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", "\n    return x\nline 1\n}\nline 0\nline 0\n{\n\n}\n}\n}\n\nline 1\nline 0\n\n}\nline 0\nline 0\n}\n}\nline 0\n{\n    return x\n}\n    return x\nline 0\n\nline 1\n{\n\nline 0\nline 1\nline 0\n{\n}\n", 3, "--- a\n+++ b\n@@ -1,7 +1,6 @@\n \n     return x\n line 1\n-    return x\n }\n line 0\n line 0\n@@ -22,9 +21,10 @@\n line 0\n {\n     return x\n+}\n     return x\n line 0\n-line 1\n+\n line 1\n {\n \n"),
        ("{\nline 3\nline 4\n{\nline 1\nline 2\nline 3\nline 2\n\nline 1\nline 2\nline 0\nline 6\n", "{\nline 3\nline 4\nline 2\nline 3\nline 4\nline 2\n\nline 1\n{\nline 7\nline 0\nline 6", 3, "--- a\n+++ b\n@@ -1,13 +1,13 @@\n {\n line 3\n line 4\n-{\n-line 1\n line 2\n line 3\n+line 4\n line 2\n \n line 1\n-line 2\n+{\n+line 7\n line 0\n-line 6\n+line 6\n\\ No newline at end of file\n"),
        ("line 1\nline 0\nline 2\nline 4\n}\n    return x\n}\nline 4\nline 7\n", "line 1\nline 0\nline 2\nline 4\n    return x\n}\n    return x\n}\nline 4\nline 7\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n line 2\n line 4\n+    return x\n }\n     return x\n }\n"),
        ("}\nline 1\n    return x\nline 0\n\nline 5\n    return x\nline 4\nline 0\nline 1\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\n}\nline 4\nline 2\n    return x\n\n}\nline 1\n}\nline 5\n\nline 5\n", "}\nline 1\n    return x\nline 0\n\n    return x\nline 4\nline 0\nline 1\nline 5\nline 3\n    return x\n    return x\nline 0\nline 4\n    return x\nline 0\nline 2\n}\n{\nline 4\nline 2\n    return x\n{\n\n}\nline 1\n}\nline 5\n\nline 4\nline 5\n", 3, "--- a\n+++ b\n@@ -3,11 +3,11 @@\n     return x\n line 0\n \n-line 5\n     return x\n line 4\n line 0\n line 1\n+line 5\n line 3\n     return x\n     return x\n@@ -18,14 +18,15 @@\n line 2\n }\n {\n-}\n line 4\n line 2\n     return x\n+{\n \n }\n line 1\n }\n line 5\n \n+line 4\n line 5\n"),
        ("line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 3\nline 4\n\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 2\nline 4\n\nline 0\n", "line 0\n{\n\nline 7\nline 6\nline 0\nline 3\n{\nline 1\n\nline 6\nline 5\n}\nline 7\n{\nline 7\nline 0\nline 7\nline 3\nline 6\nline 4\nline 7\nline 2\nline 4\nline 7\n    return x\nline 7\nline 1\nline 0\n{\n}\nline 3\n    return x\nline 4\n\nline 0\n", 3, "--- a\n+++ b\n@@ -5,16 +5,21 @@\n line 6\n line 0\n line 3\n+{\n+line 1\n \n+line 6\n line 5\n }\n line 7\n {\n line 7\n line 0\n+line 7\n line 3\n+line 6\n line 4\n-\n+line 7\n line 2\n line 4\n line 7\n@@ -26,7 +31,6 @@\n }\n line 3\n     return x\n-line 2\n line 4\n \n line 0\n"),
        ("    return x\nline 4\nline 0\nline 4\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n    return x\n    return x\n}\n{\n\nline 3\nline 3\n}\nline 3\n", "    return x\nline 4\nline 0\n{\nline 4\n{\nline 2\n{\n    return x\n{\n\n\n}\n    return x\n    return x\nline 2\nline 2\nline 3\nline 3\n}\nline 3\n", 3, "--- a\n+++ b\n@@ -1,7 +1,7 @@\n     return x\n line 4\n line 0\n-line 4\n+{\n line 4\n {\n line 2\n@@ -10,11 +10,11 @@\n {\n \n \n+}\n     return x\n     return x\n-}\n-{\n-\n+line 2\n+line 2\n line 3\n line 3\n }\n"),
        ("line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\nline 6\n", "line 6\n    return x\nline 2\nline 1\n\nline 4\nline 5\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -6,4 +6,4 @@\n line 4\n line 5\n {\n-line 6\n+    return x\n"),
        ("}\nline 0\n{\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", "}\nline 0\nline 1\nline 3\n    return x\n    return x\nline 4\nline 3\nline 1\nline 6\nline 1\n    return x\n{\nline 1\n\nline 2\nline 4\nline 0\nline 0\nline 5\nline 0\nline 4\nline 5\nline 5\nline 6\nline 2\nline 3\n}\nline 6\n{\n    return x\n", 3, "--- a\n+++ b\n@@ -1,6 +1,5 @@\n }\n line 0\n-{\n line 1\n line 3\n     return x\n@@ -11,6 +10,7 @@\n line 6\n line 1\n     return x\n+{\n line 1\n \n line 2\n"),
        ("line 3\n}\nline 4\n}\nline 4\nline 0\n}\nline 4\n{\n", "line 3\n}\nline 4\n}\nline 4\n}\nline 4\n{\n", 3, "--- a\n+++ b\n@@ -3,7 +3,6 @@\n line 4\n }\n line 4\n-line 0\n }\n line 4\n {\n"),
        ("{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0", "{\n    return x\nline 1\nline 3\n{\n}\n\n\nline 0\n{\n\nline 0\n", 3, "--- a\n+++ b\n@@ -9,4 +9,4 @@\n line 0\n {\n \n-line 0\n\\ No newline at end of file\n+line 0\n"),
        ("line 3\n}\nline 5\nline 3\n{\nline 3\n}\nline 4\n{\n    return x\n{\n{\nline 2\n{\nline 1\n{\n{\nline 0\n", "line 3\n}\n}\nline 5\n{\nline 3\n}\nline 4\n{\n{\n{\nline 2\n{\n{\n{\nline 0\n", 3, "--- a\n+++ b\n@@ -1,18 +1,16 @@\n line 3\n }\n+}\n line 5\n-line 3\n {\n line 3\n }\n line 4\n {\n-    return x\n {\n {\n line 2\n {\n-line 1\n {\n {\n line 0\n"),
        ("{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 5\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\n{\nline 1\n}\n", "{\n{\nline 4\nline 2\nline 4\n}\nline 4\nline 1\n}\nline 1\nline 2\nline 3\n\n{\nline 5\nline 1\n\nline 0\nline 4\nline 5\n{\nline 4\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -5,7 +5,6 @@\n line 4\n }\n line 4\n-line 5\n line 1\n }\n line 1\n@@ -18,6 +17,8 @@\n \n line 0\n line 4\n+line 5\n {\n+line 4\n line 1\n }\n"),
        ("    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{", "    return x\nline 4\n{\nline 6\nline 1\nline 2\nline 0\nline 0\nline 4\nline 7\nline 1\nline 1\nline 3\n}\nline 2\nline 6\nline 7\nline 5\n{\n    return x\n    return x\n\nline 6\n}\n    return x\n    return x\nline 2\nline 6\n{\n", 3, "--- a\n+++ b\n@@ -11,7 +11,7 @@\n line 1\n line 1\n line 3\n-\n+}\n line 2\n line 6\n line 7\n@@ -26,4 +26,4 @@\n     return x\n line 2\n line 6\n-{\n\\ No newline at end of file\n+{\n"),
        ("line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", "line 3\n\n\nline 3\nline 5\nline 1\n    return x\nline 5\n}\n    return x\nline 5\nline 0\nline 6\nline 4\nline 3\nline 1\n\nline 1\n    return x\nline 3\n    return x\n    return x\n{\n", 3, ""),
        ("line 1\nline 0\n    return x\n    return x\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 0\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n    return x\nline 1\nline 0\n{\n    return x\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", "line 1\nline 0\n    return x\n    return x\n\n}\nline 1\n}\nline 1\n    return x\n    return x\nline 1\nline 2\n    return x\nline 1\n    return x\n}\nline 2\n    return x\nline 1\nline 1\n}\nline 2\n}\n    return x\nline 1\nline 0\n{\n}\nline 0\nline 1\nline 0\nline 2\n    return x\n    return x\nline 1\n}\n", 3, "--- a\n+++ b\n@@ -2,6 +2,7 @@\n line 0\n     return x\n     return x\n+\n }\n line 1\n }\n@@ -14,18 +15,18 @@\n line 1\n     return x\n }\n-line 0\n line 2\n     return x\n line 1\n line 1\n }\n line 2\n+}\n     return x\n line 1\n line 0\n {\n-    return x\n+}\n line 0\n line 1\n line 0\n"),
        ("line 4\n\n    return x\nline 0\nline 0\n\nline 6\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", "line 4\n\n    return x\nline 0\nline 0\n\nline 6\n    return x\nline 6\n    return x\nline 1\n\n\nline 1\nline 1\nline 5\n{\nline 2\nline 1\nline 2\nline 4\n{\n    return x\n{\n}\nline 5\nline 6\n{\n}\nline 4\n\n}\n{\nline 6\n", 3, "--- a\n+++ b\n@@ -5,6 +5,7 @@\n line 0\n \n line 6\n+    return x\n line 6\n     return x\n line 1\n"),
        ("line 6\n\nline 3\nline 6\nline 5\n\nline 6\nline 6\nline 1\nline 5\nline 6\nline 5\n    return x\n", "line 6\nline 5\n\nline 6\nline 6\nline 1\nline 1\nline 5\nline 6\nline 5\n    return x\n", 3, "--- a\n+++ b\n@@ -1,12 +1,10 @@\n line 6\n-\n-line 3\n-line 6\n line 5\n \n line 6\n line 6\n line 1\n+line 1\n line 5\n line 6\n line 5\n"),
        ("line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\n}\nline 2\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0", "line 0\n}\n}\n}\nline 2\n{\nline 0\n\nline 2\n    return x\n{\n    return x\n\n    return x\n{\nline 0\nline 2\nline 0\n}\nline 2\nline 0\n}\n}\nline 1\nline 1\n{\n\n    return x\nline 1\n    return x\nline 0\nline 2\n    return x\n}\nline 2\nline 0\nline 0\n", 3, "--- a\n+++ b\n@@ -15,9 +15,9 @@\n {\n line 0\n line 2\n+line 0\n }\n line 2\n-line 2\n line 0\n }\n }\n@@ -25,6 +25,7 @@\n line 1\n {\n \n+    return x\n line 1\n     return x\n line 0\n@@ -32,4 +33,5 @@\n     return x\n }\n line 2\n-line 0\n\\ No newline at end of file\n+line 0\n+line 0\n"),
    ];

    const LINES: [(&str, &str, &[Op]); 12] = [
        ("", "", &[]),
        ("a\n", "a\n", &[('=', "a")]),
        ("", "a\n", &[('+', "a")]),
        ("a\n", "", &[('-', "a")]),
        ("a\nb\nc\n", "a\nc\n", &[('=', "a"), ('-', "b"), ('=', "c")]),
        ("a\nb\nc\n", "a\nB\nc\n", &[('=', "a"), ('-', "b"), ('+', "B"), ('=', "c")]),
        ("a\nb", "a\nb\n", &[('=', "a"), ('-', "b"), ('+', "b")]),
        ("a\nb\n", "a\nb", &[('=', "a"), ('-', "b"), ('+', "b")]),
        ("x", "y", &[('-', "x"), ('+', "y")]),
        ("a\n\nb\n", "a\nb\n", &[('=', "a"), ('-', ""), ('=', "b")]),
        ("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\nY\n12\n", &[('=', "1"), ('=', "2"), ('-', "3"), ('+', "X"), ('=', "4"), ('=', "5"), ('=', "6"), ('=', "7"), ('=', "8"), ('=', "9"), ('=', "10"), ('-', "11"), ('+', "Y"), ('=', "12")]),
        ("a\nb\na\nb\n", "b\na\nb\na\n", &[('-', "a"), ('=', "b"), ('=', "a"), ('=', "b"), ('+', "a")]),
    ];
}
