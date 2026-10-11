// SPDX-License-Identifier: Apache-2.0

//! Descriptive statistics on a non-empty slice of finite numbers: a summary
//! (sample variance with n-1, two-pass mean and variance), type-7 percentiles
//! (linear interpolation between closest ranks, the numpy and R default) and a
//! histogram over strictly increasing bucket edges.

use std::fmt;

/// Empty input, NaN or infinity, a percentile outside 0..=100 or bad edges.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StatsError(pub String);

impl fmt::Display for StatsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "stats: {}", self.0)
    }
}

impl std::error::Error for StatsError {}

fn err<T>(m: &str) -> Result<T, StatsError> {
    Err(StatsError(m.to_string()))
}

/// The result of [`summary`].
#[derive(Clone, Debug, PartialEq)]
pub struct Summary {
    pub count: usize,
    pub sum: f64,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
    pub median: f64,
    pub variance: f64,
    pub stddev: f64,
    pub p25: f64,
    pub p75: f64,
    pub p90: f64,
    pub p95: f64,
    pub p99: f64,
}

/// Bucket counts plus the values below the first and above the last edge.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Histogram {
    pub counts: Vec<usize>,
    pub below: usize,
    pub above: usize,
}

fn check(xs: &[f64]) -> Result<(), StatsError> {
    if xs.is_empty() {
        return err("empty input");
    }
    if xs.iter().any(|x| !x.is_finite()) {
        return err("values must be finite");
    }
    Ok(())
}

fn sorted(xs: &[f64]) -> Vec<f64> {
    let mut s = xs.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    s
}

fn sorted_percentile(s: &[f64], q: f64) -> f64 {
    let h = (s.len() - 1) as f64 * q / 100.0;
    let lo = h.floor() as usize;
    if lo + 1 >= s.len() {
        return s[s.len() - 1];
    }
    s[lo] + (h - lo as f64) * (s[lo + 1] - s[lo])
}

/// The q-th percentile (0..=100) by linear interpolation.
pub fn percentile(xs: &[f64], q: f64) -> Result<f64, StatsError> {
    check(xs)?;
    if !(0.0..=100.0).contains(&q) {
        return err("q must be in 0..=100");
    }
    Ok(sorted_percentile(&sorted(xs), q))
}

/// Count, sum, min, max, mean, median, sample variance, standard deviation
/// and the 25th/75th/90th/95th/99th percentiles.
pub fn summary(xs: &[f64]) -> Result<Summary, StatsError> {
    check(xs)?;
    let n = xs.len();
    let sum: f64 = xs.iter().sum();
    let mean = sum / n as f64;
    let variance = if n > 1 {
        xs.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n - 1) as f64
    } else {
        0.0
    };
    let s = sorted(xs);
    let p = |q| sorted_percentile(&s, q);
    Ok(Summary {
        count: n,
        sum,
        min: s[0],
        max: s[n - 1],
        mean,
        median: p(50.0),
        variance,
        stddev: variance.sqrt(),
        p25: p(25.0),
        p75: p(75.0),
        p90: p(90.0),
        p95: p(95.0),
        p99: p(99.0),
    })
}

/// Buckets `xs` by strictly increasing `edges`: bucket i holds
/// `edges[i] <= x < edges[i+1]` and the last bucket also holds the last edge.
pub fn histogram(xs: &[f64], edges: &[f64]) -> Result<Histogram, StatsError> {
    check(xs)?;
    if edges.len() < 2
        || edges.iter().any(|e| !e.is_finite())
        || edges.windows(2).any(|w| w[1] <= w[0])
    {
        return err("edges must be finite, strictly increasing and at least two");
    }
    let mut h = Histogram {
        counts: vec![0; edges.len() - 1],
        below: 0,
        above: 0,
    };
    let last = edges[edges.len() - 1];
    for &x in xs {
        if x < edges[0] {
            h.below += 1;
        } else if x > last {
            h.above += 1;
        } else if x == last {
            *h.counts.last_mut().unwrap() += 1;
        } else {
            let (mut lo, mut hi) = (0, edges.len() - 1);
            while hi - lo > 1 {
                let mid = (lo + hi) / 2;
                if edges[mid] <= x {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            h.counts[lo] += 1;
        }
    }
    Ok(h)
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    fn near(a: f64, b: f64) -> bool {
        a == b || (a - b).abs() <= 1e-9 * a.abs().max(b.abs())
    }

    #[test]
    fn summary_vectors() {
        let cases: Vec<(&[f64], usize, [f64; 12])> = vec![
            (
                &[1.0][..],
                1,
                [1.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0],
            ),
            (
                &[1.0, 2.0][..],
                2,
                [
                    3.0,
                    1.0,
                    2.0,
                    1.5,
                    1.5,
                    0.5,
                    0.7071067811865476,
                    1.25,
                    1.75,
                    1.9,
                    1.95,
                    1.99,
                ],
            ),
            (
                &[3.0, 1.0, 2.0][..],
                3,
                [6.0, 1.0, 3.0, 2.0, 2.0, 1.0, 1.0, 1.5, 2.5, 2.8, 2.9, 2.98],
            ),
            (
                &[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..],
                8,
                [
                    40.0,
                    2.0,
                    9.0,
                    5.0,
                    4.5,
                    4.571428571428571,
                    2.138089935299395,
                    4.0,
                    5.5,
                    7.6,
                    8.3,
                    8.86,
                ],
            ),
            (
                &[1.5, 2.5, -3.25, 10.0, 0.0][..],
                5,
                [
                    10.75,
                    -3.25,
                    10.0,
                    2.15,
                    1.5,
                    23.9875,
                    4.897703543498729,
                    0.0,
                    2.5,
                    7.000000000000001,
                    8.499999999999998,
                    9.7,
                ],
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                10,
                [
                    550.0,
                    10.0,
                    100.0,
                    55.0,
                    55.0,
                    916.6666666666666,
                    30.276503540974915,
                    32.5,
                    77.5,
                    91.0,
                    95.5,
                    99.1,
                ],
            ),
            (
                &[1000000004.0, 1000000007.0, 1000000013.0, 1000000016.0][..],
                4,
                [
                    4000000040.0,
                    1000000004.0,
                    1000000016.0,
                    1000000010.0,
                    1000000010.0,
                    30.0,
                    5.477225575051661,
                    1000000006.25,
                    1000000013.75,
                    1000000015.1,
                    1000000015.55,
                    1000000015.91,
                ],
            ),
        ];
        for (xs, count, want) in cases {
            let s = summary(xs).unwrap();
            assert_eq!(s.count, count);
            let got = [
                s.sum, s.min, s.max, s.mean, s.median, s.variance, s.stddev, s.p25, s.p75, s.p90,
                s.p95, s.p99,
            ];
            for i in 0..12 {
                assert!(
                    near(got[i], want[i]),
                    "{xs:?} field {i}: {} vs {}",
                    got[i],
                    want[i]
                );
            }
        }
        for xs in [&[][..], &[1.0, f64::NAN][..], &[f64::INFINITY][..]] {
            assert!(summary(xs).is_err(), "{xs:?}");
        }
    }

    #[test]
    fn percentile_vectors() {
        let cases: Vec<(&[f64], f64, f64)> = vec![
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 0.0, 2.0),
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 10.0, 3.4),
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 33.3, 4.0),
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 50.0, 4.5),
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 99.9, 8.986),
            (&[2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0][..], 100.0, 9.0),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 0.0, -3.25),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 10.0, -1.95),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 33.3, 0.4979999999999998),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 50.0, 1.5),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 99.9, 9.970000000000002),
            (&[1.5, 2.5, -3.25, 10.0, 0.0][..], 100.0, 10.0),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                0.0,
                10.0,
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                10.0,
                19.0,
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                33.3,
                39.97,
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                50.0,
                55.0,
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                99.9,
                99.91,
            ),
            (
                &[10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0][..],
                100.0,
                100.0,
            ),
        ];
        for (xs, q, want) in cases {
            let got = percentile(xs, q).unwrap();
            assert!(near(got, want), "{xs:?} {q}: {got} vs {want}");
        }
        for (xs, q) in [(&[1.0, 2.0][..], -1.0), (&[1.0, 2.0][..], 100.5)] {
            assert!(percentile(xs, q).is_err(), "{q}");
        }
    }

    #[test]
    fn histogram_vectors() {
        assert_eq!(
            histogram(
                &[1.0, 2.0, 2.5, 3.0, 5.0, 9.0, -1.0, 10.0, 11.0][..],
                &[0.0, 2.0, 5.0, 10.0][..]
            ),
            Ok(Histogram {
                counts: vec![1, 3, 3],
                below: 1,
                above: 1
            })
        );
        assert_eq!(
            histogram(&[0.5][..], &[0.0, 1.0][..]),
            Ok(Histogram {
                counts: vec![1],
                below: 0,
                above: 0
            })
        );
        for edges in [&[0.0][..], &[1.0, 1.0][..], &[2.0, 1.0][..]] {
            assert!(histogram(&[1.0], edges).is_err(), "{edges:?}");
        }
    }
}
