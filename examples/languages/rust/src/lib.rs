// SPDX-License-Identifier: Apache-2.0
//! Bounded, ASCII identifier validation; not authentication or SQL sanitization.
//! The capability modules below are independent, tested examples.

pub mod calculator;
pub mod csv_safe;
pub mod form_schema;
pub mod ics_events;
pub mod money;
pub mod oidc_pkce;
pub mod recovery_codes;
pub mod seo_files;
pub mod signed_cursors;
pub mod structured_data;
pub mod totp;
pub mod utm_links;

pub fn valid_identifier(value: &str, max_len: usize) -> bool {
    max_len > 0 && value.len() <= max_len && !value.is_empty()
        && value.bytes().enumerate().all(|(i, c)| {
            c.is_ascii_alphanumeric() || (i > 0 && (c == b'_' || c == b'-'))
        })
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn accepted() { assert!(valid_identifier("user_1", 16)); assert!(valid_identifier("A", 1)); }
    #[test] fn rejected() { for s in ["", "_bad", "a/b", "é", "a b"] { assert!(!valid_identifier(s, 16)); } assert!(!valid_identifier("abcd", 3)); }
}
