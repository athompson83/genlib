// SPDX-License-Identifier: Apache-2.0

//! Half-open integer intervals `[start, end)` as `(i64, i64)` pairs. Every
//! interval must have `start < end`. Results are sorted, non-overlapping and
//! have adjacent intervals merged; touching intervals do not overlap.

use std::fmt;

/// A half-open interval `[start, end)`.
pub type Interval = (i64, i64);

/// An interval with `start >= end`, or `lo >= hi` for [`gaps`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IntervalError(pub String);

impl fmt::Display for IntervalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "intervals: {}", self.0)
    }
}

impl std::error::Error for IntervalError {}

fn validate(xs: &[Interval]) -> Result<(), IntervalError> {
    match xs.iter().find(|x| x.0 >= x.1) {
        Some(x) => Err(IntervalError(format!("bad interval [{}, {})", x.0, x.1))),
        None => Ok(()),
    }
}

/// Sorts `xs` and joins overlapping or adjacent intervals.
pub fn merge(xs: &[Interval]) -> Result<Vec<Interval>, IntervalError> {
    validate(xs)?;
    let mut s = xs.to_vec();
    s.sort();
    let mut out: Vec<Interval> = Vec::new();
    for (a, b) in s {
        match out.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => out.push((a, b)),
        }
    }
    Ok(out)
}

/// The ranges covered by both `a` and `b`.
pub fn intersect(a: &[Interval], b: &[Interval]) -> Result<Vec<Interval>, IntervalError> {
    let (a, b) = (merge(a)?, merge(b)?);
    let (mut i, mut j, mut out) = (0, 0, Vec::new());
    while i < a.len() && j < b.len() {
        let (s, e) = (a[i].0.max(b[j].0), a[i].1.min(b[j].1));
        if s < e {
            out.push((s, e));
        }
        if a[i].1 < b[j].1 {
            i += 1;
        } else {
            j += 1;
        }
    }
    merge(&out)
}

/// The ranges of `a` not covered by `b`.
pub fn subtract(a: &[Interval], b: &[Interval]) -> Result<Vec<Interval>, IntervalError> {
    let (a, b) = (merge(a)?, merge(b)?);
    let mut out = Vec::new();
    for &(s, e) in &a {
        let mut cur = s;
        for &(bs, be) in &b {
            if be <= cur || bs >= e {
                continue;
            }
            if bs > cur {
                out.push((cur, bs));
            }
            cur = cur.max(be);
            if cur >= e {
                break;
            }
        }
        if cur < e {
            out.push((cur, e));
        }
    }
    Ok(out)
}

/// The parts of `[lo, hi)` that `xs` does not cover; `lo` must be below `hi`.
pub fn gaps(xs: &[Interval], lo: i64, hi: i64) -> Result<Vec<Interval>, IntervalError> {
    if lo >= hi {
        return Err(IntervalError("lo must be less than hi".into()));
    }
    subtract(&[(lo, hi)], xs)
}

/// The covered length after merging.
pub fn total(xs: &[Interval]) -> Result<i64, IntervalError> {
    Ok(merge(xs)?.iter().map(|(s, e)| e - s).sum())
}

/// True when `x` and `y` share a point (touching is not overlapping).
pub fn overlaps(x: Interval, y: Interval) -> Result<bool, IntervalError> {
    validate(&[x, y])?;
    Ok(x.0 < y.1 && y.0 < x.1)
}

/// True when `p` lies in any interval of `xs`.
pub fn contains(xs: &[Interval], p: i64) -> Result<bool, IntervalError> {
    validate(xs)?;
    Ok(xs.iter().any(|&(s, e)| s <= p && p < e))
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn interval_vectors() {
        assert_eq!(
            merge(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..]),
            Ok(vec![(1, 6), (8, 10), (15, 20)])
        );
        assert_eq!(
            merge(&[(5, 7), (1, 2), (2, 3)][..]),
            Ok(vec![(1, 3), (5, 7)])
        );
        assert_eq!(merge(&[][..]), Ok(vec![]));
        assert_eq!(merge(&[(-5, -1), (-3, 4)][..]), Ok(vec![(-5, 4)]));
        assert_eq!(
            intersect(
                &[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..],
                &[(0, 2), (5, 9), (17, 30)][..]
            ),
            Ok(vec![(1, 2), (5, 6), (8, 9), (17, 20)])
        );
        assert_eq!(intersect(&[(1, 2)][..], &[(2, 3)][..]), Ok(vec![]));
        assert_eq!(
            intersect(&[(0, 100)][..], &[(10, 20), (30, 40)][..]),
            Ok(vec![(10, 20), (30, 40)])
        );
        assert_eq!(
            subtract(
                &[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..],
                &[(0, 2), (5, 9), (17, 30)][..]
            ),
            Ok(vec![(2, 5), (9, 10), (15, 17)])
        );
        assert_eq!(
            subtract(&[(0, 10)][..], &[(2, 3), (5, 7)][..]),
            Ok(vec![(0, 2), (3, 5), (7, 10)])
        );
        assert_eq!(subtract(&[(0, 10)][..], &[(0, 10)][..]), Ok(vec![]));
        assert_eq!(subtract(&[(0, 10)][..], &[][..]), Ok(vec![(0, 10)]));
        assert_eq!(
            gaps(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 0, 25),
            Ok(vec![(0, 1), (6, 8), (10, 15), (20, 25)])
        );
        assert_eq!(gaps(&[][..], 3, 5), Ok(vec![(3, 5)]));
        assert_eq!(
            total(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..]),
            Ok(12)
        );
        assert_eq!(total(&[(0, 2), (5, 9), (17, 30)][..]), Ok(19));
        assert_eq!(overlaps((1, 3), (2, 4)), Ok(true));
        assert_eq!(overlaps((1, 3), (3, 4)), Ok(false));
        assert_eq!(overlaps((5, 9), (6, 7)), Ok(true));
        assert_eq!(overlaps((1, 2), (5, 6)), Ok(false));
        assert_eq!(
            contains(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 6),
            Ok(false)
        );
        assert_eq!(
            contains(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 5),
            Ok(true)
        );
        assert_eq!(
            contains(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 20),
            Ok(false)
        );
        assert_eq!(
            contains(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 19),
            Ok(true)
        );
        assert_eq!(
            contains(&[(1, 3), (2, 6), (8, 10), (15, 18), (18, 20)][..], 0),
            Ok(false)
        );
        for bad in [&[(3, 3)][..], &[(5, 1)][..]] {
            assert!(merge(bad).is_err() && total(bad).is_err() && contains(bad, 0).is_err());
            assert!(overlaps(bad[0], (0, 1)).is_err());
        }
        assert!(gaps(&[], 5, 5).is_err());
    }
}
