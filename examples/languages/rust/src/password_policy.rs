// SPDX-License-Identifier: Apache-2.0

//! NIST SP 800-63B style password checks: length in Unicode code points, a
//! blocklist and context words, no composition rules. Use a large
//! breached-password list as the blocklist, allow every printable character
//! including spaces and emoji, never truncate, and rate-limit attempts on the
//! server. Store passwords only with a password hash.

use std::fmt;

/// Invalid options (`min_length < 1` or `max_length < min_length`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PolicyError(pub String);

impl fmt::Display for PolicyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for PolicyError {}

/// Options; the default is 15..64 code points with no blocklist or context.
#[derive(Clone, Debug)]
pub struct PolicyOptions<'a> {
    pub min_length: usize,
    pub max_length: usize,
    /// Compared after ASCII lowercasing.
    pub blocklist: Vec<&'a str>,
    /// User name, email, service name; entries of at least 4 characters apply.
    pub context: Vec<&'a str>,
}

impl Default for PolicyOptions<'_> {
    fn default() -> Self {
        PolicyOptions { min_length: 15, max_length: 64, blocklist: vec![], context: vec![] }
    }
}

/// Failures in the order too-short, too-long, control-characters,
/// blocklisted, contains-context, repetitive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PolicyResult {
    pub ok: bool,
    pub failures: Vec<&'static str>,
}

const ALNUM: &str = "0123456789abcdefghijklmnopqrstuvwxyz";

fn repetitive(cps: &[char]) -> bool {
    cps.windows(4).any(|w| {
        if w.iter().all(|&c| c == w[0]) {
            return true;
        }
        let lw: String = w.iter().map(char::to_ascii_lowercase).collect();
        let rev: String = lw.chars().rev().collect();
        lw.bytes().all(|c| c.is_ascii_digit() || c.is_ascii_lowercase()) && (ALNUM.contains(&lw) || ALNUM.contains(&rev))
    })
}

/// Checks `password` against the options.
pub fn check_password(password: &str, o: &PolicyOptions) -> Result<PolicyResult, PolicyError> {
    if o.min_length < 1 || o.max_length < o.min_length {
        return Err(PolicyError("need 1 <= min_length <= max_length".into()));
    }
    let cps: Vec<char> = password.chars().collect();
    let low = password.to_ascii_lowercase();
    let mut failures = Vec::new();
    if cps.len() < o.min_length {
        failures.push("too-short");
    }
    if cps.len() > o.max_length {
        failures.push("too-long");
    }
    if cps.iter().any(|&c| c < '\u{20}' || ('\u{7f}'..='\u{9f}').contains(&c)) {
        failures.push("control-characters");
    }
    if o.blocklist.iter().any(|b| b.to_ascii_lowercase() == low) {
        failures.push("blocklisted");
    }
    if o.context.iter().any(|c| c.chars().count() >= 4 && low.contains(&c.to_ascii_lowercase())) {
        failures.push("contains-context");
    }
    if repetitive(&cps) {
        failures.push("repetitive");
    }
    Ok(PolicyResult { ok: failures.is_empty(), failures })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cases() {
        let d = PolicyOptions::default;
        let long_a = "a".repeat(65);
        let emoji = "\u{1F600}".repeat(15);
        for (pw, o, want) in [
            ("correct horse battery staple", d(), vec![]),
            ("short", d(), vec!["too-short"]),
            ("Tr0ub4dor&3", PolicyOptions { min_length: 8, ..d() }, vec![]),
            ("password", PolicyOptions { min_length: 8, blocklist: vec!["Password", "123456"], ..d() }, vec!["blocklisted"]),
            (&long_a, PolicyOptions { max_length: 64, ..d() }, vec!["too-long", "repetitive"]),
            ("aaaa-unique-phrase-x", d(), vec!["repetitive"]),
            ("my-1234-long-passphrase", d(), vec!["repetitive"]),
            ("zyxw-backwards-phrase!", d(), vec!["repetitive"]),
            ("alice-secret-passphrase", PolicyOptions { context: vec!["alice", "example"], ..d() }, vec!["contains-context"]),
            ("tab\tinside-long-enough", d(), vec!["control-characters"]),
            ("ünïcödé-pässwörd-long", d(), vec![]),
            (&emoji, d(), vec!["repetitive"]),
            ("ABCD-upper-sequence-x", d(), vec!["repetitive"]),
        ] {
            let want = PolicyResult { ok: want.is_empty(), failures: want };
            assert_eq!(check_password(pw, &o), Ok(want), "{pw}");
        }
        assert!(check_password("x", &PolicyOptions { min_length: 0, ..d() }).is_err());
        assert!(check_password("x", &PolicyOptions { min_length: 10, max_length: 9, ..d() }).is_err());
    }
}
