// SPDX-License-Identifier: Apache-2.0

//! String distance over Unicode code points (not bytes or UTF-16 units):
//! Levenshtein, optimal string alignment (Damerau), Jaro, Jaro-Winkler and a
//! normalized similarity ratio.

/// Insert/delete/substitute edit distance.
pub fn levenshtein(a: &str, b: &str) -> usize {
    let (x, y): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let mut prev: Vec<usize> = (0..=y.len()).collect();
    for (i, ca) in x.iter().enumerate() {
        let mut cur = vec![i + 1];
        for (j, cb) in y.iter().enumerate() {
            cur.push((prev[j + 1] + 1).min(cur[j] + 1).min(prev[j] + usize::from(ca != cb)));
        }
        prev = cur;
    }
    prev[y.len()]
}

/// Optimal string alignment distance: Levenshtein plus adjacent transposition
/// at cost 1 (no substring edited twice).
pub fn damerau_osa(a: &str, b: &str) -> usize {
    let (x, y): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let (n, m) = (x.len(), y.len());
    let mut d = vec![vec![0usize; m + 1]; n + 1];
    for (i, row) in d.iter_mut().enumerate() {
        row[0] = i;
    }
    for (j, cell) in d[0].iter_mut().enumerate() {
        *cell = j;
    }
    for i in 1..=n {
        for j in 1..=m {
            let cost = usize::from(x[i - 1] != y[j - 1]);
            d[i][j] = (d[i - 1][j] + 1).min(d[i][j - 1] + 1).min(d[i - 1][j - 1] + cost);
            if i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1] {
                d[i][j] = d[i][j].min(d[i - 2][j - 2] + 1);
            }
        }
    }
    d[n][m]
}

/// Jaro similarity in [0, 1]: 1 for two empty strings, 0 when exactly one is
/// empty. The match window is max(len)/2 - 1, floored at 0.
pub fn jaro(a: &str, b: &str) -> f64 {
    let (x, y): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    if x.is_empty() && y.is_empty() {
        return 1.0;
    }
    if x.is_empty() || y.is_empty() {
        return 0.0;
    }
    let w = (x.len().max(y.len()) / 2).saturating_sub(1);
    let (mut mx, mut my) = (vec![false; x.len()], vec![false; y.len()]);
    let mut m = 0usize;
    for (i, c) in x.iter().enumerate() {
        for j in i.saturating_sub(w)..y.len().min(i + w + 1) {
            if !my[j] && y[j] == *c {
                mx[i] = true;
                my[j] = true;
                m += 1;
                break;
            }
        }
    }
    if m == 0 {
        return 0.0;
    }
    let (mut t, mut k) = (0usize, 0usize);
    for i in 0..x.len() {
        if mx[i] {
            while !my[k] {
                k += 1;
            }
            if x[i] != y[k] {
                t += 1;
            }
            k += 1;
        }
    }
    let fm = m as f64;
    (fm / x.len() as f64 + fm / y.len() as f64 + (fm - t as f64 / 2.0) / fm) / 3.0
}

/// Jaro boosted by a common prefix of at most 4 code points (scale 0.1).
pub fn jaro_winkler(a: &str, b: &str) -> f64 {
    let j = jaro(a, b);
    let l = a.chars().zip(b.chars()).take(4).take_while(|(p, q)| p == q).count();
    j + l as f64 * 0.1 * (1.0 - j)
}

/// 1 - levenshtein / max(len), and 1 for two empty strings.
pub fn similarity_ratio(a: &str, b: &str) -> f64 {
    let n = a.chars().count().max(b.chars().count());
    if n == 0 {
        1.0
    } else {
        1.0 - levenshtein(a, b) as f64 / n as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairs() {
        for (a, b, lev, osa, j, jw, ratio) in [
            ("kitten", "sitting", 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714),
            ("flaw", "lawn", 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5),
            ("", "", 0, 0, 1.0, 1.0, 1.0),
            ("", "abc", 3, 3, 0.0, 0.0, 0.0),
            ("abc", "abc", 0, 0, 1.0, 1.0, 1.0),
            ("ca", "abc", 3, 3, 0.0, 0.0, 0.0),
            ("MARTHA", "MARHTA", 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667),
            ("DIXON", "DICKSONX", 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5),
            ("DWAYNE", "DUANE", 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667),
            ("café", "cafe", 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75),
            ("naïve", "naive", 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8),
            ("🙂ab", "ab🙂", 2, 2, 0.0, 0.0, 0.33333333333333337),
            ("JELLYFISH", "SMELLYFISH", 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8),
        ] {
            assert_eq!(levenshtein(a, b), lev, "levenshtein {a} {b}");
            assert_eq!(damerau_osa(a, b), osa, "osa {a} {b}");
            for (name, got, want) in [("jaro", jaro(a, b), j), ("jaro_winkler", jaro_winkler(a, b), jw), ("ratio", similarity_ratio(a, b), ratio)] {
                assert!((got - want).abs() <= 1e-12, "{name}({a}, {b}) = {got}, want {want}");
            }
        }
    }
}
