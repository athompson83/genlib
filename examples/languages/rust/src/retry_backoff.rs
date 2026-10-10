// SPDX-License-Identifier: Apache-2.0

//! Retry timing: exponential backoff with "full jitter" and HTTP `Retry-After`
//! parsing (delay-seconds or IMF-fixdate). The random fraction and the current
//! time are injected so results are deterministic.

use std::fmt;

/// Validation or parse error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BackoffError(pub String);

impl fmt::Display for BackoffError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for BackoffError {}

fn err<T>(m: impl Into<String>) -> Result<T, BackoffError> {
    Err(BackoffError(m.into()))
}

/// `floor(random_fraction * min(cap_ms, base_ms * 2^attempt))`. The exponential
/// term is capped before it can overflow, so any attempt count is safe.
pub fn backoff_delay(attempt: u32, base_ms: u64, cap_ms: u64, random_fraction: f64) -> Result<u64, BackoffError> {
    if base_ms == 0 {
        return err("baseMs must be positive");
    }
    if cap_ms < base_ms {
        return err("capMs must be at least baseMs");
    }
    if !(0.0..1.0).contains(&random_fraction) {
        return err("randomFraction must be in [0, 1)");
    }
    let mut ceiling = base_ms;
    for _ in 0..attempt {
        if ceiling >= cap_ms {
            break;
        }
        ceiling = ceiling.saturating_mul(2);
    }
    let ceiling = ceiling.min(cap_ms);
    Ok(((random_fraction * ceiling as f64).floor() as u64).min(ceiling.saturating_sub(1)))
}

const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        2 if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn digits(s: &str) -> Option<i64> {
    (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok()).flatten()
}

/// Parses an IMF-fixdate such as `Wed, 21 Oct 2026 07:28:00 GMT` to unix milliseconds.
fn parse_imf_fixdate(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 29 || &s[3..5] != ", " || b[7] != b' ' || b[11] != b' ' || b[16] != b' ' || b[19] != b':'
        || b[22] != b':' || &s[25..] != " GMT"
    {
        return None;
    }
    let day = digits(&s[5..7])?;
    let month = MONTHS.iter().position(|&m| m == &s[8..11])? as i64 + 1;
    let year = digits(&s[12..16])?;
    let (h, mi, sec) = (digits(&s[17..19])?, digits(&s[20..22])?, digits(&s[23..25])?);
    if day < 1 || day > days_in_month(year, month) || h > 23 || mi > 59 || sec > 60 {
        return None;
    }
    let days = days_from_civil(year, month, day);
    if DAYS[days.rem_euclid(7) as usize] != &s[..3] {
        return None;
    }
    Some(((days * 24 + h) * 60 + mi) * 60_000 + sec * 1000)
}

/// Milliseconds to wait for a `Retry-After` value: delay-seconds become
/// `seconds * 1000`; an IMF-fixdate becomes `max(0, date - now_ms)`. Anything
/// else (including other date formats and overflowing numbers) is an error.
pub fn retry_after_ms(header_value: &str, now_ms: i64) -> Result<u64, BackoffError> {
    let value = header_value.trim();
    if !value.is_empty() && value.bytes().all(|b| b.is_ascii_digit()) {
        return value
            .parse::<u64>()
            .ok()
            .and_then(|s| s.checked_mul(1000))
            .ok_or_else(|| BackoffError("Retry-After seconds out of range".into()));
    }
    match parse_imf_fixdate(value) {
        Some(at) => Ok(u64::try_from(at.saturating_sub(now_ms)).unwrap_or(0)),
        None => err("Retry-After must be delay-seconds or an IMF-fixdate"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_vectors() {
        assert_eq!(backoff_delay(0, 100, 10000, 0.5).unwrap(), 50);
        assert_eq!(backoff_delay(3, 100, 10000, 0.999).unwrap(), 799);
        assert_eq!(backoff_delay(10, 100, 10000, 0.25).unwrap(), 2500);
        assert_eq!(backoff_delay(3, 100, 10000, 0.0).unwrap(), 0);
    }

    #[test]
    fn backoff_large_attempts_and_rejections() {
        assert_eq!(backoff_delay(u32::MAX, 100, 10000, 0.5).unwrap(), 5000);
        assert_eq!(backoff_delay(200, u64::MAX / 2, u64::MAX, 0.0).unwrap(), 0);
        assert!(backoff_delay(0, 0, 10, 0.5).is_err());
        assert!(backoff_delay(0, 100, 99, 0.5).is_err());
        assert!(backoff_delay(0, 100, 1000, 1.0).is_err());
        assert!(backoff_delay(0, 100, 1000, -0.1).is_err());
        assert!(backoff_delay(0, 100, 1000, f64::NAN).is_err());
    }

    #[test]
    fn retry_after_vectors() {
        assert_eq!(retry_after_ms("120", 0).unwrap(), 120000);
        assert_eq!(retry_after_ms("Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000).unwrap(), 30000);
        assert_eq!(retry_after_ms("Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000).unwrap(), 0);
    }

    #[test]
    fn retry_after_rejections() {
        for bad in ["", "-1", "1.5", "soon", "Thu, 21 Oct 2026 07:28:00 GMT", "Wed, 32 Oct 2026 07:28:00 GMT",
            "Wed, 21 Oct 2026 07:28:00 UTC", "Wednesday, 21-Oct-26 07:28:00 GMT", "99999999999999999999"]
        {
            assert!(retry_after_ms(bad, 0).is_err(), "{bad}");
        }
    }
}
