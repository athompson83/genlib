// SPDX-License-Identifier: Apache-2.0
//! Bounded, ASCII identifier validation; not authentication or SQL sanitization.
//! The capability modules below are independent, tested examples.

pub mod base_encodings;
pub mod calculator;
pub mod check_digits;
pub mod content_negotiation;
pub mod cookies;
pub mod cron_next;
pub mod csv_safe;
pub mod email_address;
pub mod feature_flags;
pub mod form_schema;
pub mod geo;
pub mod geometry;
pub mod hashing;
pub mod http_conditional;
pub mod http_range;
pub mod human_units;
pub mod ics_events;
pub mod ids;
pub mod ip_cidr;
pub mod iso_duration;
pub mod line_diff;
pub mod money;
pub mod oidc_pkce;
pub mod password_policy;
pub mod polyline;
pub mod recovery_codes;
pub mod retry_backoff;
pub mod rrule;
pub mod safe_redirect;
pub mod semver;
pub mod seo_files;
pub mod signed_cursors;
pub mod signed_urls;
pub mod string_similarity;
pub mod structured_data;
pub mod text_sanitize;
pub mod tile_math;
pub mod token_bucket;
pub mod totp;
pub mod url_normalize;
pub mod utm_links;
pub mod vcard;
pub mod wcag_contrast;
pub mod webhook_signature;

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
