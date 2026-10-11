// SPDX-License-Identifier: Apache-2.0
//! Bounded, ASCII identifier validation; not authentication or SQL sanitization.
//! The capability modules below are independent, tested examples.

pub mod base58;
pub mod base_encodings;
pub mod bloom_filter;
pub mod business_days;
pub mod cache_control;
pub mod calculator;
pub mod check_digits;
pub mod circuit_breaker;
pub mod color_convert;
pub mod content_disposition;
pub mod content_negotiation;
pub mod cookies;
pub mod cron_next;
pub mod csv_safe;
pub mod data_uri;
pub mod dotenv;
pub mod dotted_path;
pub mod email_address;
pub mod feature_flags;
pub mod file_signature;
pub mod form_schema;
pub mod geo;
pub mod geometry;
pub mod glob_match;
pub mod hashing;
pub mod html_escape;
pub mod http_conditional;
pub mod http_range;
pub mod human_units;
pub mod ics_events;
pub mod ids;
pub mod ini_parse;
pub mod interval_merge;
pub mod ip_cidr;
pub mod iso_duration;
pub mod iso_week;
pub mod json_patch;
pub mod line_diff;
pub mod link_header;
pub mod markdown_table;
pub mod mime_types;
pub mod money;
pub mod natural_sort;
pub mod ndjson;
pub mod number_words;
pub mod oidc_pkce;
pub mod pagination_window;
pub mod password_generate;
pub mod password_policy;
pub mod pii_mask;
pub mod polyline;
pub mod punycode;
pub mod query_string;
pub mod recovery_codes;
pub mod retry_backoff;
pub mod roman_numerals;
pub mod rrule;
pub mod safe_redirect;
pub mod semver;
pub mod seo_files;
pub mod shell_quote;
pub mod signed_cursors;
pub mod signed_urls;
pub mod slugify;
pub mod sse;
pub mod stats_summary;
pub mod string_similarity;
pub mod structured_data;
pub mod template_render;
pub mod text_chunking;
pub mod text_sanitize;
pub mod text_wrap;
pub mod tile_math;
pub mod token_bucket;
pub mod topo_sort;
pub mod totp;
pub mod url_normalize;
pub mod url_template;
pub mod utm_links;
pub mod vcard;
pub mod vector_math;
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
