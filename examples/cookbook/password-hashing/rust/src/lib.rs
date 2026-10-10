// SPDX-License-Identifier: Apache-2.0
//! Argon2id password hashing with the RustCrypto `argon2` crate.
//! OWASP Password Storage Cheat Sheet minimum: m=19456 KiB, t=2, p=1.
//! Hashes are PHC strings. `bcrypt` is a legacy reader / fallback.

use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::{Algorithm, Argon2, Params, Version};

pub const M_COST_KIB: u32 = 19_456;
pub const T_COST: u32 = 2;
pub const P_COST: u32 = 1;

fn hasher() -> Argon2<'static> {
    let params = Params::new(M_COST_KIB, T_COST, P_COST, Some(32)).expect("valid params");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

#[derive(Debug)]
pub struct Error(String);
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Error {}

pub fn hash_password(password: &str) -> Result<String, Error> {
    hasher()
        .hash_password(password.as_bytes())
        .map(|h| h.to_string())
        .map_err(|e| Error(e.to_string()))
}

/// Outcome of a verification. Persist `rehash` when it is `Some`.
#[derive(Debug, PartialEq, Eq)]
pub enum Verified {
    Mismatch,
    Ok { rehash: Option<String> },
}

pub fn verify_password(stored: &str, password: &str) -> Result<Verified, Error> {
    if stored.starts_with("$2a$") || stored.starts_with("$2b$") || stored.starts_with("$2y$") {
        return match bcrypt::verify(password, stored) {
            Ok(true) => Ok(Verified::Ok { rehash: Some(hash_password(password)?) }),
            Ok(false) => Ok(Verified::Mismatch),
            Err(e) => Err(Error(e.to_string())),
        };
    }
    let parsed = PasswordHash::new(stored).map_err(|e| Error(e.to_string()))?;
    // Parameters come from the stored hash, not from `hasher()`.
    match hasher().verify_password(password.as_bytes(), &parsed) {
        Ok(()) => {}
        Err(argon2::password_hash::Error::PasswordInvalid) => return Ok(Verified::Mismatch),
        Err(e) => return Err(Error(e.to_string())),
    }
    let params = Params::try_from(&parsed).map_err(|e| Error(e.to_string()))?;
    let outdated = parsed.algorithm.as_str() != "argon2id"
        || params.m_cost() < M_COST_KIB
        || params.t_cost() < T_COST;
    Ok(Verified::Ok { rehash: if outdated { Some(hash_password(password)?) } else { None } })
}

/// Fallback where Argon2 is not permitted. OWASP: cost >= 10; 72-byte limit enforced.
pub fn bcrypt_hash(password: &str, cost: u32) -> Result<String, Error> {
    bcrypt::non_truncating_hash(password, cost).map_err(|e| Error(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_and_verify() {
        let h = hash_password("correct horse battery staple").unwrap();
        assert!(h.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"), "{h}");
        assert_eq!(verify_password(&h, "correct horse battery staple").unwrap(), Verified::Ok { rehash: None });
        assert_eq!(verify_password(&h, "wrong").unwrap(), Verified::Mismatch);
        assert_ne!(h, hash_password("correct horse battery staple").unwrap());
    }

    #[test]
    fn weak_params_rehash() {
        let weak = Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::new(8192, 1, 1, None).unwrap())
            .hash_password(b"pw")
            .unwrap()
            .to_string();
        match verify_password(&weak, "pw").unwrap() {
            Verified::Ok { rehash: Some(h) } => assert!(h.starts_with("$argon2id$v=19$m=19456,t=2,p=1$")),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn other_library_param_order() {
        // node-argon2 0.45.1 output (m,p,t order) for "pw".
        let node = "$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA";
        assert_eq!(verify_password(node, "pw").unwrap(), Verified::Ok { rehash: None });
        // argon2-cffi 25.1.0 (reference libargon2) output for "pw".
        let cffi = "$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc";
        assert_eq!(verify_password(cffi, "pw").unwrap(), Verified::Ok { rehash: None });
    }

    #[test]
    fn bcrypt_upgrade() {
        let legacy = bcrypt_hash("pw", 10).unwrap();
        assert!(matches!(verify_password(&legacy, "pw").unwrap(), Verified::Ok { rehash: Some(h) } if h.starts_with("$argon2id$")));
        assert_eq!(verify_password(&legacy, "nope").unwrap(), Verified::Mismatch);
        assert!(bcrypt_hash(&"x".repeat(73), 10).is_err());
    }

    #[test]
    fn malformed() {
        assert!(verify_password("not-a-hash", "pw").is_err());
    }
}
