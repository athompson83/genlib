// SPDX-License-Identifier: Apache-2.0

//! Deterministic feature flag evaluation. The bucket is FNV-1a 32 of
//! `key:userId` modulo 10000, so the same user always gets the same answer
//! for the same flag, and raising the rollout percentage only adds users
//! (nobody already in the rollout drops out). Variants use a separate
//! `key:variant:userId` hash so assignment is independent of the rollout.

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

fn fnv1a32(s: &str) -> u32 {
    s.bytes().fold(0x811c_9dc5u32, |h, b| (h ^ u32::from(b)).wrapping_mul(0x0100_0193))
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
    let bucket = fnv1a32(&format!("{k}:{user_id}")) % 10000;
    let variant = || {
        if total == 0 {
            return None;
        }
        let mut x = u64::from(fnv1a32(&format!("{k}:variant:{user_id}"))) % total;
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
            (&checkout, "user-1", false, "excluded", 4063, None),
            (&checkout, "user-2", true, "rollout", 1682, None),
            (&checkout, "user-3", false, "excluded", 9301, None),
            (&checkout, "user-42", false, "excluded", 9926, None),
            (&checkout, "alice@example.com", false, "excluded", 2919, None),
            (&lists, "user-1", false, "deny", 4063, None),
            (&lists, "user-2", true, "allow", 1682, None),
            (&beta, "vip", false, "disabled", 3546, None),
            (&pct("banner", 0.0), "user-1", false, "excluded", 6646, None),
            (&pct("banner", 100.0), "user-1", true, "rollout", 6646, None),
            (&pct("banner", 12.34), "user-9", false, "excluded", 7598, None),
            (&pricing, "u1", true, "rollout", 4196, Some("monthly-first")),
            (&pricing, "u2", true, "rollout", 7053, Some("control")),
            (&pricing, "u3", true, "rollout", 9434, Some("annual-first")),
            (&pricing, "u4", true, "rollout", 1339, Some("annual-first")),
            (&pricing, "u5", true, "rollout", 3720, Some("annual-first")),
            (&pricing, "ünïcode", true, "rollout", 9874, Some("control")),
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
}
