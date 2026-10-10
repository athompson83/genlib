// SPDX-License-Identifier: Apache-2.0

//! Natural sort ("file2" before "file10"): runs of ASCII digits compare by
//! numeric value at any length, other runs compare after ASCII-only case
//! folding by code point, with deterministic tie-breaks.

use std::cmp::Ordering;

fn runs(s: &str) -> Vec<(bool, &str)> {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        let digit = b[i].is_ascii_digit();
        let mut j = i;
        while j < b.len() && b[j].is_ascii_digit() == digit {
            j += 1;
        }
        out.push((digit, &s[i..j]));
        i = j;
    }
    out
}

fn strip_zeros(s: &str) -> &str {
    let t = s.trim_start_matches('0');
    if t.is_empty() {
        "0"
    } else {
        t
    }
}

/// Natural order of `a` and `b`: run by run (digits by value, a digit run before a text run, text by ASCII-folded code points); ties: fewer runs, fewer leading zeros, then plain code point order.
pub fn natural_compare(a: &str, b: &str) -> Ordering {
    let (ra, rb) = (runs(a), runs(b));
    for (&(da, xa), &(db, xb)) in ra.iter().zip(&rb) {
        let c = if da && db {
            let (na, nb) = (strip_zeros(xa), strip_zeros(xb));
            na.len().cmp(&nb.len()).then_with(|| na.cmp(nb))
        } else if da != db {
            if da {
                Ordering::Less
            } else {
                Ordering::Greater
            }
        } else {
            xa.to_ascii_lowercase().cmp(&xb.to_ascii_lowercase())
        };
        if c != Ordering::Equal {
            return c;
        }
    }
    let c = ra.len().cmp(&rb.len());
    if c != Ordering::Equal {
        return c;
    }
    for (&(da, xa), &(db, xb)) in ra.iter().zip(&rb) {
        if da && db && xa.len() != xb.len() {
            return xa.len().cmp(&xb.len());
        }
    }
    a.cmp(b)
}

/// A new vector sorted with [`natural_compare`] (stable).
pub fn natural_sort<S: AsRef<str> + Clone>(items: &[S]) -> Vec<S> {
    let mut out = items.to_vec();
    out.sort_by(|x, y| natural_compare(x.as_ref(), y.as_ref()));
    out
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    use std::cmp::Ordering;

    #[test]
    fn sorted_vectors() {
        let cases: &[(&[&str], &[&str])] = &[
            (&["file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1"], &["", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"]),
            (&["v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10"], &["v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"]),
            (&["img12.png", "img10.png", "IMG2.png", "img1.png"], &["img1.png", "IMG2.png", "img10.png", "img12.png"]),
            (&["a0", "a00", "a000", "a", "a1", "a01"], &["a", "a0", "a00", "a000", "a1", "a01"]),
            (&["\u{c4}", "Z", "a", "z", "_x", "1x"], &["1x", "_x", "a", "Z", "z", "\u{c4}"]),
        ];
        for &(input, want) in cases {
            assert_eq!(natural_sort(input), want);
        }
    }

    #[test]
    fn compare_vectors() {
        let cases: &[(&str, &str, Ordering)] = &[
            ("a2", "a10", Ordering::Less),
            ("a10", "a2", Ordering::Greater),
            ("abc", "ABC", Ordering::Greater),
            ("x01", "x1", Ordering::Greater),
            ("x1", "x1", Ordering::Equal),
            ("", "a", Ordering::Less),
            ("a", "1", Ordering::Greater),
            ("99999999999999999999", "100000000000000000000", Ordering::Less),
        ];
        for &(a, b, want) in cases {
            assert_eq!(natural_compare(a, b), want, "{a:?} {b:?}");
        }
    }
}
