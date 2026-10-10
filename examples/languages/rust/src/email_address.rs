// SPDX-License-Identifier: Apache-2.0

//! WHATWG HTML "valid e-mail address" syntax (the `<input type=email>` rule),
//! ASCII only, hand-parsed, with a 254 character total and 64 character
//! local-part limit. Syntax only: `a@b` and `user.@example.com` are valid by
//! WHATWG, and only a confirmation email proves an address belongs to a user.

use std::fmt;

/// Invalid address passed to `email_normalize`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EmailError(pub String);

impl fmt::Display for EmailError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for EmailError {}

fn local_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b".!#$%&'*+/=?^_`{|}~-".contains(&b)
}

fn valid_label(label: &[u8]) -> bool {
    !label.is_empty()
        && label.len() <= 63
        && label[0].is_ascii_alphanumeric()
        && label[label.len() - 1].is_ascii_alphanumeric()
        && label.iter().all(|b| b.is_ascii_alphanumeric() || *b == b'-')
}

/// Whether `s` is a syntactically valid email address.
pub fn email_valid(s: &str) -> bool {
    if s.len() > 254 {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else { return false };
    !local.is_empty()
        && local.len() <= 64
        && local.bytes().all(local_char)
        && domain.as_bytes().split(|b| *b == b'.').all(valid_label)
}

/// Trims ASCII whitespace, validates and lowercases the domain only.
pub fn email_normalize(s: &str) -> Result<String, EmailError> {
    let t = s.trim_matches(|c| matches!(c, ' ' | '\t' | '\n' | '\x0c' | '\r'));
    if !email_valid(t) {
        return Err(EmailError("invalid email address".into()));
    }
    let (local, domain) = t.split_once('@').expect("validated");
    Ok(format!("{local}@{}", domain.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_vectors() {
        for (s, want) in [
            ("user@example.com", true),
            ("first.last+tag@sub.Example.CO.uk", true),
            ("o'brien@example.ie", true),
            ("a@b", true),
            ("user@-example.com", false),
            ("user@example-.com", false),
            ("user@exa_mple.com", false),
            ("user example@example.com", false),
            ("user@@example.com", false),
            ("@example.com", false),
            ("user@", false),
            ("user@example..com", false),
            ("user.@example.com", true),
            ("ünïcode@example.com", false),
            ("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@example.com", true),
            ("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx@example.com", false),
            ("u@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", true),
            ("u@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", false),
            ("user@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com", false),
        ] {
            assert_eq!(email_valid(s), want, "{s}");
        }
    }

    #[test]
    fn normalize() {
        assert_eq!(email_normalize("  Mixed.Case@Example.COM ").unwrap(), "Mixed.Case@example.com");
        assert!(email_normalize("user@@example.com").is_err());
    }
}
