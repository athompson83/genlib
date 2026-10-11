// SPDX-License-Identifier: Apache-2.0

//! Bloom filter with deterministic FNV-1a 64-bit double hashing, so filters
//! built in any Genlib language serialize to the same bytes.
//!
//! Position i of an item is `(h1 + i*h2) mod m` in wrapping u64 arithmetic,
//! where h is FNV-1a 64 of the item's UTF-8 bytes, h1 its low 32 bits and h2
//! its high 32 bits. Bit j lives in byte `j >> 3` at mask `1 << (j & 7)`; the
//! serialized form is unpadded base64url of the `ceil(m/8)` bytes.

use crate::base_encodings::{base64url_decode, base64url_encode};
use std::fmt;

/// Invalid sizing input, filter parameters or serialized state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BloomError(pub String);

impl fmt::Display for BloomError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "bloom filter: {}", self.0)
    }
}

impl std::error::Error for BloomError {}

fn err<T>(m: &str) -> Result<T, BloomError> {
    Err(BloomError(m.to_string()))
}

/// FNV-1a 64-bit hash of `data`.
pub fn fnv1a64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Bit count `m` (at least 8) and hash count `k` for `n` items at
/// false-positive rate `p`.
pub fn bloom_size_for(n: u64, p: f64) -> Result<(usize, u32), BloomError> {
    if n < 1 || !(p > 0.0 && p < 1.0) {
        return err("n must be >= 1 and 0 < p < 1");
    }
    let ln2 = std::f64::consts::LN_2;
    let m = ((-(n as f64) * p.ln() / (ln2 * ln2)).ceil() as usize).max(8);
    let k = ((m as f64 / n as f64 * ln2 + 0.5).floor() as u32).max(1);
    Ok((m, k))
}

/// A fixed-size Bloom filter of `m` bits and `k` hashes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BloomFilter {
    m: usize,
    k: u32,
    bits: Vec<u8>,
}

impl BloomFilter {
    /// An empty filter; `m` must be at least 8 and `k` in 1..=64.
    pub fn new(m: usize, k: u32) -> Result<Self, BloomError> {
        if m < 8 || !(1..=64).contains(&k) {
            return err("m must be >= 8 and k in 1..=64");
        }
        Ok(BloomFilter {
            m,
            k,
            bits: vec![0; m.div_ceil(8)],
        })
    }

    /// The number of bits.
    pub fn m(&self) -> usize {
        self.m
    }

    /// The number of hash positions per item.
    pub fn k(&self) -> u32 {
        self.k
    }

    /// The k bit positions of `item`.
    pub fn positions(&self, item: &str) -> Vec<usize> {
        let h = fnv1a64(item.as_bytes());
        let (h1, h2) = (h & 0xffff_ffff, h >> 32);
        (0..self.k as u64)
            .map(|i| (h1.wrapping_add(i.wrapping_mul(h2)) % self.m as u64) as usize)
            .collect()
    }

    /// Records `item` in the filter.
    pub fn add(&mut self, item: &str) {
        for j in self.positions(item) {
            self.bits[j >> 3] |= 1 << (j & 7);
        }
    }

    /// True when all of `item`'s bits are set (false means definitely absent).
    pub fn might_contain(&self, item: &str) -> bool {
        self.positions(item)
            .into_iter()
            .all(|j| self.bits[j >> 3] & (1 << (j & 7)) != 0)
    }

    /// Estimated number of distinct items added; `None` when saturated.
    pub fn count_estimate(&self) -> Option<u64> {
        let x: u32 = self.bits.iter().map(|b| b.count_ones()).sum();
        if x as usize >= self.m {
            return None;
        }
        let m = self.m as f64;
        Some((-m / self.k as f64 * (1.0 - x as f64 / m).ln() + 0.5).floor() as u64)
    }

    /// The bit array as unpadded base64url.
    pub fn serialize(&self) -> String {
        base64url_encode(&self.bits)
    }

    /// Rebuilds a filter from [`serialize`](Self::serialize) output, rejecting
    /// a wrong length.
    pub fn deserialize(m: usize, k: u32, text: &str) -> Result<Self, BloomError> {
        let mut f = Self::new(m, k)?;
        match base64url_decode(text) {
            Ok(raw) if raw.len() == f.bits.len() => {
                f.bits = raw;
                Ok(f)
            }
            Ok(_) => err("serialized length does not match m"),
            Err(_) => err("invalid base64url"),
        }
    }

    /// A new filter holding the members of both; `m` and `k` must match.
    pub fn union(&self, other: &BloomFilter) -> Result<BloomFilter, BloomError> {
        if self.m != other.m || self.k != other.k {
            return err("m and k must match");
        }
        let bits = self
            .bits
            .iter()
            .zip(&other.bits)
            .map(|(a, b)| a | b)
            .collect();
        Ok(BloomFilter {
            m: self.m,
            k: self.k,
            bits,
        })
    }
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn fnv_vectors() {
        for (s, h) in [
            ("apple", 0xf74a62a458befdbf_u64),
            ("banana", 0xb4d3b6b1c372c890_u64),
            ("", 0xcbf29ce484222325_u64),
            ("caf\u{e9}", 0x48e8823acfa40d89_u64),
            ("\u{1f600}", 0xfeff073875020288_u64),
            ("user:42", 0x6c151ea4dcd221c2_u64),
            (
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                0x060324515a7b4e27_u64,
            ),
        ] {
            assert_eq!(fnv1a64(s.as_bytes()), h, "{s}");
        }
    }

    #[test]
    fn size_vectors() {
        for (n, p, m, k) in [
            (1, 0.5, 8, 6),
            (10, 0.01, 96, 7),
            (100, 0.01, 959, 7),
            (1000, 0.001, 14378, 10),
            (5000, 0.05, 31177, 4),
            (3, 0.3, 8, 2),
        ] {
            assert_eq!(bloom_size_for(n, p), Ok((m, k)), "{n} {p}");
        }
        for (n, p) in [(0, 0.1), (10, 0.0), (10, 1.0), (10, 1.5)] {
            assert!(bloom_size_for(n, p).is_err(), "{n} {p}");
        }
    }

    #[test]
    fn filter_vectors() {
        let mut f = BloomFilter::new(256, 5).unwrap();
        for (s, want) in [
            ("apple", vec![191, 99, 7, 171, 79]),
            ("banana", vec![144, 65, 242, 163, 84]),
            ("", vec![37, 9, 237, 209, 181]),
            ("caf\u{e9}", vec![137, 195, 253, 55, 113]),
            ("\u{1f600}", vec![136, 192, 248, 48, 104]),
            ("user:42", vec![194, 102, 10, 174, 82]),
            (
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                vec![39, 120, 201, 26, 107],
            ),
        ] {
            assert_eq!(f.positions(s), want, "{s}");
        }
        for s in ["apple", "banana", "", "caf\u{e9}", "\u{1f600}"] {
            f.add(s);
        }
        assert_eq!(f.serialize(), "gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE");
        for (s, want) in [
            ("apple", true),
            ("banana", true),
            ("", true),
            ("caf\u{e9}", true),
            ("\u{1f600}", true),
            ("cherry", false),
            ("user:42", false),
            ("zzz", false),
            ("Apple", false),
        ] {
            assert_eq!(f.might_contain(s), want, "{s}");
        }
        assert_eq!(f.count_estimate(), Some(5));
        let g = BloomFilter::deserialize(256, 5, &f.serialize()).unwrap();
        assert_eq!(g, f);
        let mut cherry = BloomFilter::new(256, 5).unwrap();
        cherry.add("cherry");
        let u = f.union(&cherry).unwrap();
        assert_eq!(u.serialize(), "gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE");
        assert_eq!(u.count_estimate(), Some(6));
        assert!(u.might_contain("cherry"));
        assert!(f.union(&BloomFilter::new(264, 5).unwrap()).is_err());
        assert!(BloomFilter::deserialize(256, 5, "AAAA").is_err());
        assert!(
            BloomFilter::new(7, 1).is_err()
                && BloomFilter::new(8, 0).is_err()
                && BloomFilter::new(8, 65).is_err()
        );
        let mut full = BloomFilter::new(8, 1).unwrap();
        for i in 0..400 {
            full.add(&i.to_string());
        }
        assert_eq!(full.count_estimate(), None);
    }
}
