// SPDX-License-Identifier: Apache-2.0

//! Byte sizes (format and parse), durations and relative times ("in 3
//! minutes", "2 years ago"). All rounding is half up in integer arithmetic,
//! so results never depend on floating point.

use std::fmt;

/// Invalid size, duration or option.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UnitsError(pub String);

impl fmt::Display for UnitsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for UnitsError {}

fn err<T>(m: &str) -> Result<T, UnitsError> {
    Err(UnitsError(m.into()))
}

/// Decimal (SI: kB = 1000 B) or binary (IEC: KiB = 1024 B) units.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ByteBase {
    Si,
    Iec,
}

fn round_div(n: u128, d: u128) -> u128 {
    let (q, r) = (n / d, n % d);
    q + u128::from(r >= d - r)
}

/// Formats `n` with up to `decimals` (0..3) fraction digits, trailing zeros
/// removed: 1536 -> "1.5 KiB" (IEC) or "1.5 kB" (SI).
pub fn format_bytes(n: u64, base: ByteBase, decimals: u32) -> Result<String, UnitsError> {
    if decimals > 3 || n > i64::MAX as u64 {
        return err("need n <= 2^63-1 and decimals 0..3");
    }
    let (units, step): ([&str; 7], u128) = match base {
        ByteBase::Si => (["B", "kB", "MB", "GB", "TB", "PB", "EB"], 1000),
        ByteBase::Iec => (["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"], 1024),
    };
    let n = u128::from(n);
    if n < step {
        return Ok(format!("{n} B"));
    }
    let mut i = 1;
    while i < 6 && n >= step.pow(i + 1) {
        i += 1;
    }
    let scale = 10u128.pow(decimals);
    let mut v = round_div(n * scale, step.pow(i));
    if v >= step * scale && i < 6 {
        i += 1;
        v = round_div(n * scale, step.pow(i));
    }
    let mut s = (v / scale).to_string();
    if decimals > 0 {
        let frac = format!("{:0width$}", v % scale, width = decimals as usize);
        let frac = frac.trim_end_matches('0');
        if !frac.is_empty() {
            s.push('.');
            s.push_str(frac);
        }
    }
    Ok(format!("{s} {}", units[i as usize]))
}

/// Parses "1.5 GiB", "2.25MB", " 10 b " or "512" (bytes), rounded half up.
/// Units are case-insensitive; signs, exponents and a leading "." are
/// rejected, as are results above 2^63-1.
pub fn parse_bytes(text: &str) -> Result<u64, UnitsError> {
    let t = text.trim();
    let int_len = t.bytes().take_while(u8::is_ascii_digit).count();
    if int_len == 0 {
        return err("invalid byte size");
    }
    let (int_part, mut rest) = t.split_at(int_len);
    let mut frac = "";
    if let Some(r) = rest.strip_prefix('.') {
        let n = r.bytes().take_while(u8::is_ascii_digit).count();
        if n == 0 {
            return err("invalid byte size");
        }
        frac = &r[..n];
        rest = &r[n..];
    }
    let unit = rest.trim_start();
    if !unit.bytes().all(|c| c.is_ascii_alphabetic()) {
        return err("invalid byte size");
    }
    let mult: u64 = match unit.to_ascii_lowercase().as_str() {
        "" | "b" => 1,
        "kb" => 1_000,
        "mb" => 1_000_000,
        "gb" => 1_000_000_000,
        "tb" => 1_000_000_000_000,
        "pb" => 1_000_000_000_000_000,
        "eb" => 1_000_000_000_000_000_000,
        "kib" => 1 << 10,
        "mib" => 1 << 20,
        "gib" => 1 << 30,
        "tib" => 1 << 40,
        "pib" => 1 << 50,
        "eib" => 1 << 60,
        _ => return err("unknown byte unit"),
    };
    let mut whole: u128 = 0;
    for c in int_part.bytes() {
        whole = whole * 10 + u128::from(c - b'0');
        if whole > i64::MAX as u128 {
            return err("byte size above 2^63-1");
        }
    }
    // Multiply the decimal fraction by mult digit by digit from the right: the
    // final carry is floor(mult * 0.frac) and the top product digit rounds.
    let (mut carry, mut top) = (0u128, 0u128);
    for c in frac.bytes().rev() {
        let x = u128::from(c - b'0') * u128::from(mult) + carry;
        carry = x / 10;
        top = x % 10;
    }
    let r = whole * u128::from(mult) + carry + u128::from(top >= 5);
    if r > i64::MAX as u128 {
        return err("byte size above 2^63-1");
    }
    Ok(r as u64)
}

/// Milliseconds: below one second "850ms", otherwise the two largest
/// non-zero units of d, h, m, s ("1h 2m", "1d 1h", "45s").
pub fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        return format!("{ms}ms");
    }
    let mut s = ms / 1000;
    let mut parts = Vec::new();
    for (name, size) in [("d", 86400), ("h", 3600), ("m", 60), ("s", 1)] {
        let q = s / size;
        if q > 0 && parts.len() < 2 {
            parts.push(format!("{q}{name}"));
        }
        s %= size;
    }
    parts.join(" ")
}

/// Describes `delta_seconds` (positive = future) as "just now", "in a
/// minute", "3 hours ago", "in 2 months" or "10 years ago" with thresholds
/// 45 s, 90 s, 45 min, 90 min, 22 h, 36 h, 26 d, 46 d, 320 d and 548 d, an
/// average Gregorian month (2629746 s) and year (31556952 s).
pub fn relative_time(delta_seconds: i64) -> String {
    let a = u128::from(delta_seconds.unsigned_abs());
    let n = |d: u128, unit: &str| format!("{} {unit}", round_div(a, d));
    let p = match a {
        _ if a < 45 => return "just now".into(),
        _ if a < 90 => "a minute".to_string(),
        _ if a < 45 * 60 => n(60, "minutes"),
        _ if a < 90 * 60 => "an hour".into(),
        _ if a < 22 * 3600 => n(3600, "hours"),
        _ if a < 36 * 3600 => "a day".into(),
        _ if a < 26 * 86400 => n(86400, "days"),
        _ if a < 46 * 86400 => "a month".into(),
        _ if a < 320 * 86400 => n(2_629_746, "months"),
        _ if a < 548 * 86400 => "a year".into(),
        _ => n(31_556_952, "years"),
    };
    if delta_seconds > 0 {
        format!("in {p}")
    } else {
        format!("{p} ago")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ByteBase::{Iec, Si};

    #[test]
    fn bytes_format() {
        for (n, base, d, want) in [
            (0u64, Si, 1u32, "0 B"),
            (999, Si, 1, "999 B"),
            (1000, Si, 1, "1 kB"),
            (1536, Iec, 1, "1.5 KiB"),
            (1536, Si, 1, "1.5 kB"),
            (999950, Si, 1, "1 MB"),
            (999949, Si, 1, "999.9 kB"),
            (1048576, Iec, 2, "1 MiB"),
            (123456789, Si, 2, "123.46 MB"),
            (123456789, Iec, 0, "118 MiB"),
            (9223372036854775807, Iec, 3, "8 EiB"),
            (1023, Iec, 1, "1023 B"),
            (1024, Iec, 1, "1 KiB"),
            (5000000000000, Si, 1, "5 TB"),
        ] {
            assert_eq!(format_bytes(n, base, d).as_deref(), Ok(want), "{n} {base:?} {d}");
        }
        assert!(format_bytes(1, Si, 4).is_err());
        assert!(format_bytes(1 << 63, Si, 1).is_err());
    }

    #[test]
    fn bytes_parse() {
        for (s, want) in [
            ("0", 0u64),
            ("512", 512),
            ("1kB", 1000),
            ("1 KiB", 1024),
            ("1.5 GiB", 1610612736),
            ("2.25MB", 2250000),
            (" 10 b ", 10),
            ("1.0005 kB", 1001),
            ("1.5", 2),
            ("0.5 B", 1),
            ("7 EiB", 8070450532247928832),
        ] {
            assert_eq!(parse_bytes(s), Ok(want), "{s}");
        }
        for s in ["", "abc", "1 KB B", "1.5.2 MB", "-1 kB", "1 kbit", "1e3 B", "9 EiB", ".5 kB"] {
            assert!(parse_bytes(s).is_err(), "{s}");
        }
    }

    #[test]
    fn durations() {
        for (ms, want) in [
            (0u64, "0ms"),
            (850, "850ms"),
            (1000, "1s"),
            (45000, "45s"),
            (65000, "1m 5s"),
            (3600000, "1h"),
            (3725000, "1h 2m"),
            (90061000, "1d 1h"),
            (172800000, "2d"),
            (59999, "59s"),
        ] {
            assert_eq!(format_duration(ms), want, "{ms}");
        }
    }

    #[test]
    fn relative() {
        for (d, want) in [
            (0i64, "just now"),
            (30, "just now"),
            (-44, "just now"),
            (45, "in a minute"),
            (-89, "a minute ago"),
            (90, "in 2 minutes"),
            (150, "in 3 minutes"),
            (-2670, "45 minutes ago"),
            (2700, "in an hour"),
            (5399, "in an hour"),
            (5400, "in 2 hours"),
            (-75600, "21 hours ago"),
            (79200, "in a day"),
            (129599, "in a day"),
            (129600, "in 2 days"),
            (2246400, "in a month"),
            (-3974400, "2 months ago"),
            (15552000, "in 6 months"),
            (27648000, "in a year"),
            (-47347200, "2 years ago"),
            (63115200, "in 2 years"),
            (315569520, "in 10 years"),
        ] {
            assert_eq!(relative_time(d), want, "{d}");
        }
    }
}
