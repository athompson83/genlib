// SPDX-License-Identifier: Apache-2.0

//! Vector math for embeddings: dot product, norm, cosine similarity,
//! normalization, brute-force top-k search and maximal marginal relevance
//! (MMR) re-ranking. Sums run plainly left to right.

use std::fmt;

/// Length mismatch, empty or zero vector, or an out-of-range parameter.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VectorError(pub String);

impl fmt::Display for VectorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for VectorError {}

fn err<T>(m: &str) -> Result<T, VectorError> {
    Err(VectorError(m.to_string()))
}

fn check(a: &[f64], b: &[f64]) -> Result<(), VectorError> {
    if a.len() != b.len() {
        return err("vectors must have the same length");
    }
    if a.is_empty() {
        return err("vectors must not be empty");
    }
    Ok(())
}

fn raw_dot(a: &[f64], b: &[f64]) -> f64 {
    let mut s = 0.0;
    for (x, y) in a.iter().zip(b) {
        s += x * y;
    }
    s
}

/// Dot product of two equal-length, non-empty vectors.
pub fn dot(a: &[f64], b: &[f64]) -> Result<f64, VectorError> {
    check(a, b)?;
    Ok(raw_dot(a, b))
}

/// Euclidean length of a non-empty vector.
pub fn norm(a: &[f64]) -> Result<f64, VectorError> {
    if a.is_empty() {
        return err("vectors must not be empty");
    }
    Ok(raw_dot(a, a).sqrt())
}

/// Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros.
pub fn cosine(a: &[f64], b: &[f64]) -> Result<f64, VectorError> {
    check(a, b)?;
    let (na, nb) = (raw_dot(a, a).sqrt(), raw_dot(b, b).sqrt());
    if na == 0.0 || nb == 0.0 {
        return Ok(0.0);
    }
    Ok((raw_dot(a, b) / (na * nb)).clamp(-1.0, 1.0))
}

/// The unit vector in the direction of `a`; a zero vector is an error.
pub fn normalize(a: &[f64]) -> Result<Vec<f64>, VectorError> {
    let n = norm(a)?;
    if n == 0.0 {
        return err("cannot normalize a zero vector");
    }
    Ok(a.iter().map(|x| x / n).collect())
}

/// `(index, score)` of the `k` most cosine-similar vectors, best first; ties keep the lower index.
pub fn top_k<V: AsRef<[f64]>>(query: &[f64], vectors: &[V], k: usize) -> Result<Vec<(usize, f64)>, VectorError> {
    let mut scored = Vec::with_capacity(vectors.len());
    for (i, v) in vectors.iter().enumerate() {
        scored.push((i, cosine(query, v.as_ref())?));
    }
    scored.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
    scored.truncate(k);
    Ok(scored)
}

/// Maximal marginal relevance: up to `k` indices maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked); ties keep the lower index.
pub fn mmr<V: AsRef<[f64]>>(query: &[f64], vectors: &[V], k: usize, lambda: f64) -> Result<Vec<usize>, VectorError> {
    if !(0.0..=1.0).contains(&lambda) {
        return err("lambda must be in [0, 1]");
    }
    let mut rel = Vec::with_capacity(vectors.len());
    for v in vectors {
        rel.push(cosine(query, v.as_ref())?);
    }
    let want = k.min(vectors.len());
    let mut picked: Vec<usize> = Vec::new();
    let mut used = vec![false; vectors.len()];
    while picked.len() < want {
        let mut best: Option<(usize, f64)> = None;
        for i in 0..vectors.len() {
            if used[i] {
                continue;
            }
            let mut red: Option<f64> = None;
            for &j in &picked {
                let c = cosine(vectors[i].as_ref(), vectors[j].as_ref())?;
                if red.map_or(true, |r| c > r) {
                    red = Some(c);
                }
            }
            let s = lambda * rel[i] - (1.0 - lambda) * red.unwrap_or(0.0);
            if best.map_or(true, |(_, bs)| s > bs) {
                best = Some((i, s));
            }
        }
        let (i, _) = best.expect("an unused vector remains");
        used[i] = true;
        picked.push(i);
    }
    Ok(picked)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    fn near(a: f64, b: f64) -> bool {
        (a - b).abs() <= 1e-9
    }

    #[test]
    fn pairs_norm_normalize() {
        let pairs: &[(&[f64], &[f64], f64, f64)] = &[
            (&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0], 32.0, 0.9746318461970762),
            (&[1.0, 0.0], &[0.0, 1.0], 0.0, 0.0),
            (&[1.0, 1.0], &[-1.0, -1.0], -2.0, -0.9999999999999998),
            (&[0.0, 0.0], &[1.0, 2.0], 0.0, 0.0),
            (&[3.0, 4.0], &[3.0, 4.0], 25.0, 1.0),
            (&[0.5, -1.5, 2.0], &[2.0, 0.25, -1.0], -1.375, -0.23969749850222494),
        ];
        for &(a, b, d, c) in pairs {
            assert!(near(dot(a, b).unwrap(), d), "{a:?} {b:?}");
            assert!(near(cosine(a, b).unwrap(), c), "{a:?} {b:?}");
        }
        let norms: &[(&[f64], f64)] = &[
            (&[3.0, 4.0], 5.0),
            (&[0.0, 0.0, 0.0], 0.0),
            (&[1.0, 1.0, 1.0, 1.0], 2.0),
            (&[-2.5], 2.5),
        ];
        for &(a, w) in norms {
            assert!(near(norm(a).unwrap(), w));
        }
        let units: &[(&[f64], &[f64])] = &[
            (&[3.0, 4.0], &[0.6, 0.8]),
            (&[0.0, 5.0], &[0.0, 1.0]),
            (&[1.0, 1.0, 1.0, 1.0], &[0.5, 0.5, 0.5, 0.5]),
        ];
        for &(a, w) in units {
            let got = normalize(a).unwrap();
            assert_eq!(got.len(), w.len());
            assert!(got.iter().zip(w).all(|(x, y)| near(*x, *y)), "{got:?}");
        }
    }

    #[test]
    fn top_k_vectors() {
        let cases: &[(&[f64], &[&[f64]], usize, &[(usize, f64)])] = &[
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 0, &[]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 1, &[(0, 1.0)]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 3, &[(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476)]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 10, &[(0, 1.0), (1, 0.9949371890224981), (3, 0.7071067811865476), (2, 0.0), (4, -1.0)]),
            (&[0.2, 0.5, 0.1], &[&[0.1, 0.4, 0.2], &[0.9, 0.1, 0.0], &[0.2, 0.5, 0.1], &[0.0, 0.0, 1.0], &[0.3, 0.3, 0.3], &[0.21, 0.49, 0.12]], 3, &[(2, 1.0), (5, 0.9990003934498585), (0, 0.956182887467515)]),
        ];
        for &(q, vs, k, want) in cases {
            let got = top_k(q, vs, k).unwrap();
            assert_eq!(got.len(), want.len(), "k={k}");
            for (g, w) in got.iter().zip(want) {
                assert!(g.0 == w.0 && near(g.1, w.1), "k={k}: {g:?} vs {w:?}");
            }
        }
    }

    #[test]
    fn mmr_vectors() {
        let cases: &[(&[f64], &[&[f64]], usize, f64, &[usize])] = &[
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 3, 0.5, &[0, 1, 4]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 3, 1.0, &[0, 1, 3]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 3, 0.0, &[0, 4, 2]),
            (&[1.0, 0.0], &[&[1.0, 0.0], &[0.99, 0.1], &[0.0, 1.0], &[0.7, 0.7], &[-1.0, 0.0]], 5, 0.7, &[0, 1, 3, 2, 4]),
            (&[0.2, 0.5, 0.1], &[&[0.1, 0.4, 0.2], &[0.9, 0.1, 0.0], &[0.2, 0.5, 0.1], &[0.0, 0.0, 1.0], &[0.3, 0.3, 0.3], &[0.21, 0.49, 0.12]], 3, 0.5, &[2, 0, 1]),
            (&[0.2, 0.5, 0.1], &[&[0.1, 0.4, 0.2], &[0.9, 0.1, 0.0], &[0.2, 0.5, 0.1], &[0.0, 0.0, 1.0], &[0.3, 0.3, 0.3], &[0.21, 0.49, 0.12]], 4, 0.3, &[2, 3, 1, 4]),
        ];
        for &(q, vs, k, l, want) in cases {
            assert_eq!(mmr(q, vs, k, l).unwrap(), want, "k={k} lambda={l}");
        }
    }

    #[test]
    fn invalid() {
        // k=-1 is unrepresentable with usize.
        assert!(cosine(&[1.0, 2.0], &[1.0, 2.0, 3.0]).is_err());
        assert!(dot(&[], &[]).is_err());
        assert!(normalize(&[0.0, 0.0]).is_err());
        assert!(mmr(&[1.0], &[[1.0]], 1, 1.5).is_err());
    }
}
