// SPDX-License-Identifier: Apache-2.0

//! Deterministic feature flag evaluation. The bucket is FNV-1a 32 of
//! `key:userId` followed by the MurmurHash3 fmix32 finalizer, modulo 10000,
//! so the same user always gets the same answer for the same flag, and
//! raising the rollout percentage only adds users (nobody already in the
//! rollout drops out). Variants use a separate `key:variant:userId` hash so
//! assignment is independent of the rollout.
//!
//! BREAKING (behavior): earlier versions used plain FNV-1a, whose lowest bit
//! is the parity of the input bytes, so 50/50 experiments with similar keys
//! put the same users in the same half. The finalizer makes experiments
//! independent but changes every bucket and variant assignment; re-baseline
//! running rollouts and experiments when upgrading.

use std::fmt;

/// Invalid key, percentage or variant.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FlagError(pub String);

impl fmt::Display for FlagError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for FlagError {}

/// A named arm with a positive integer weight.
#[derive(Clone, Debug)]
pub struct Variant<'a> {
    pub name: &'a str,
    pub weight: i64,
}

/// One flag; build with [`Flag::new`] (enabled, 100 percent).
#[derive(Clone, Debug)]
pub struct Flag<'a> {
    pub key: &'a str,
    pub enabled: bool,
    pub allow: Vec<&'a str>,
    pub deny: Vec<&'a str>,
    /// 0..100 with at most two decimals.
    pub rollout_percent: f64,
    pub variants: Vec<Variant<'a>>,
}

impl<'a> Flag<'a> {
    pub fn new(key: &'a str) -> Self {
        Flag { key, enabled: true, allow: vec![], deny: vec![], rollout_percent: 100.0, variants: vec![] }
    }
}

/// The evaluation; `reason` is `disabled`, `deny`, `allow`, `rollout` or
/// `excluded`, and `variant` is set only when on with variants.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Evaluation {
    pub on: bool,
    pub reason: &'static str,
    pub bucket: u32,
    pub variant: Option<String>,
}

/// FNV-1a 32 over the UTF-8 bytes, then the MurmurHash3 fmix32 finalizer so
/// the low bits used by `% n` are well mixed.
fn bucket_hash(s: &str) -> u32 {
    let mut h = s.bytes().fold(0x811c_9dc5u32, |h, b| (h ^ u32::from(b)).wrapping_mul(0x0100_0193));
    h ^= h >> 16;
    h = h.wrapping_mul(0x85eb_ca6b);
    h ^= h >> 13;
    h = h.wrapping_mul(0xc2b2_ae35);
    h ^= h >> 16;
    h
}

fn err<T>(m: &str) -> Result<T, FlagError> {
    Err(FlagError(m.into()))
}

/// Checks disabled, deny, allow and then `bucket < percent * 100`.
pub fn evaluate_flag(flag: &Flag, user_id: &str) -> Result<Evaluation, FlagError> {
    let k = flag.key;
    if k.is_empty() || k.len() > 100 || !k.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c)) {
        return err("key must match [A-Za-z0-9._-]{1,100}");
    }
    let p = flag.rollout_percent;
    if !(0.0..=100.0).contains(&p) || (p * 100.0).round() != p * 100.0 {
        return err("rollout_percent must be 0..100 with at most 2 decimals");
    }
    let mut total: u64 = 0;
    for v in &flag.variants {
        if v.name.is_empty() || v.weight < 1 || v.weight > i64::from(u32::MAX) {
            return err("variants need a name and a positive integer weight");
        }
        total += v.weight as u64;
    }
    let bucket = bucket_hash(&format!("{k}:{user_id}")) % 10000;
    let variant = || {
        if total == 0 {
            return None;
        }
        let mut x = u64::from(bucket_hash(&format!("{k}:variant:{user_id}"))) % total;
        for v in &flag.variants {
            if x < v.weight as u64 {
                return Some(v.name.to_string());
            }
            x -= v.weight as u64;
        }
        None
    };
    let (on, reason) = if !flag.enabled {
        (false, "disabled")
    } else if flag.deny.contains(&user_id) {
        (false, "deny")
    } else if flag.allow.contains(&user_id) {
        (true, "allow")
    } else if f64::from(bucket) < (p * 100.0).round() {
        (true, "rollout")
    } else {
        (false, "excluded")
    };
    Ok(Evaluation { on, reason, bucket, variant: if on { variant() } else { None } })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pct(key: &str, p: f64) -> Flag<'_> {
        Flag { rollout_percent: p, ..Flag::new(key) }
    }

    #[test]
    fn cases() {
        let checkout = pct("new-checkout", 25.0);
        let lists = Flag { allow: vec!["user-2"], deny: vec!["user-1"], ..pct("new-checkout", 25.0) };
        let beta = Flag { enabled: false, allow: vec!["vip"], ..Flag::new("beta") };
        let pricing = Flag {
            variants: vec![Variant { name: "control", weight: 50 }, Variant { name: "annual-first", weight: 30 }, Variant { name: "monthly-first", weight: 20 }],
            ..Flag::new("pricing-test")
        };
        for (f, user, on, reason, bucket, variant) in [
            (&checkout, "user-1", true, "rollout", 849, None),
            (&checkout, "user-2", false, "excluded", 5308, None),
            (&checkout, "user-3", false, "excluded", 5247, None),
            (&checkout, "user-42", false, "excluded", 9209, None),
            (&checkout, "alice@example.com", false, "excluded", 9060, None),
            (&lists, "user-1", false, "deny", 849, None),
            (&lists, "user-2", true, "allow", 5308, None),
            (&beta, "vip", false, "disabled", 8844, None),
            (&pct("banner", 0.0), "user-1", false, "excluded", 6875, None),
            (&pct("banner", 100.0), "user-1", true, "rollout", 6875, None),
            (&pct("banner", 12.34), "user-9", false, "excluded", 8197, None),
            (&pricing, "u1", true, "rollout", 6435, Some("control")),
            (&pricing, "u2", true, "rollout", 401, Some("annual-first")),
            (&pricing, "u3", true, "rollout", 9955, Some("monthly-first")),
            (&pricing, "u4", true, "rollout", 8249, Some("annual-first")),
            (&pricing, "u5", true, "rollout", 6254, Some("control")),
            (&pricing, "ünïcode", true, "rollout", 7068, Some("control")),
        ] {
            let want = Evaluation { on, reason, bucket, variant: variant.map(String::from) };
            assert_eq!(evaluate_flag(f, user), Ok(want), "{} {user}", f.key);
        }
    }

    #[test]
    fn invalid() {
        for f in [
            Flag::new("bad key"),
            pct("k", 101.0),
            pct("k", 12.345),
            Flag { variants: vec![Variant { name: "a", weight: 0 }], ..Flag::new("k") },
            Flag::new(""),
        ] {
            assert!(evaluate_flag(&f, "u").is_err(), "{f:?}");
        }
    }

    /// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments.
    fn chi_square_2x2(t: [[f64; 2]; 2]) -> f64 {
        let n = t[0][0] + t[0][1] + t[1][0] + t[1][1];
        let mut chi = 0.0;
        for i in 0..2 {
            for j in 0..2 {
                let e = (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n;
                chi += (t[i][j] - e).powi(2) / e;
            }
        }
        chi
    }

    // Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar
    // keys put every subject in the same half of both. The fmix32 finalizer must keep them independent.
    #[test]
    fn experiments_are_independent() {
        let ab = || vec![Variant { name: "a", weight: 1 }, Variant { name: "b", weight: 1 }];
        for (k1, k2) in [("checkout-a", "checkout-b"), ("exp1", "exp2")] {
            let (mut parity, mut arms) = ([[0.0; 2]; 2], [[0.0; 2]; 2]);
            let (v1, v2) = (Flag { variants: ab(), ..Flag::new(k1) }, Flag { variants: ab(), ..Flag::new(k2) });
            for i in 0..10000 {
                let u = format!("u{i}");
                let b1 = evaluate_flag(&Flag::new(k1), &u).unwrap().bucket % 2;
                let b2 = evaluate_flag(&Flag::new(k2), &u).unwrap().bucket % 2;
                parity[b1 as usize][b2 as usize] += 1.0;
                let a1 = evaluate_flag(&v1, &u).unwrap().variant.as_deref() == Some("b");
                let a2 = evaluate_flag(&v2, &u).unwrap().variant.as_deref() == Some("b");
                arms[usize::from(a1)][usize::from(a2)] += 1.0;
            }
            let (cp, ca) = (chi_square_2x2(parity), chi_square_2x2(arms));
            assert!(cp < 10.83, "bucket parity {k1}/{k2} chi-square {cp:.2}");
            assert!(ca < 10.83, "50/50 variants {k1}/{k2} chi-square {ca:.2}");
        }
    }

    #[test]
    fn buckets_are_uniform() {
        let mut counts = [0i32; 100];
        for i in 0..10000 {
            counts[(evaluate_flag(&Flag::new("checkout-a"), &format!("u{i}")).unwrap().bucket % 100) as usize] += 1;
        }
        assert!(counts.iter().all(|n| (n - 100).abs() <= 40), "{counts:?}");
    }
}
