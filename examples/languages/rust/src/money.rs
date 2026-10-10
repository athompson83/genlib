// SPDX-License-Identifier: Apache-2.0

//! Money as integer minor units (ISO 4217 exponents), exact decimal parsing,
//! half-to-even rate application and remainder-preserving allocation.
//! Integer arithmetic only, with checked overflow. Standard library only.

use std::fmt;

/// Validation or overflow error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MoneyError(pub String);

impl fmt::Display for MoneyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for MoneyError {}

fn err<T>(message: impl Into<String>) -> Result<T, MoneyError> {
    Err(MoneyError(message.into()))
}

fn overflow<T>() -> Result<T, MoneyError> {
    err("amount out of range")
}

/// Minor-unit exponent for a supported ISO 4217 code (case-sensitive).
pub fn exponent(currency: &str) -> Result<u32, MoneyError> {
    match currency {
        "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "CHF" | "CNY" | "INR" | "MXN" | "BRL" | "SEK" | "NOK" | "DKK"
        | "NZD" | "SGD" | "HKD" | "ZAR" => Ok(2),
        "JPY" | "KRW" | "VND" | "CLP" | "ISK" => Ok(0),
        "BHD" | "KWD" | "JOD" | "OMR" | "TND" => Ok(3),
        _ => err(format!("unsupported currency: {currency:?}")),
    }
}

/// Parses `-?DIGITS(.DIGITS)?` into (negative, integer digits, fraction digits).
fn parse_decimal(value: &str) -> Option<(bool, &str, &str)> {
    let (negative, rest) = match value.strip_prefix('-') {
        Some(r) => (true, r),
        None => (false, value),
    };
    let (int, frac) = match rest.split_once('.') {
        Some((i, f)) => (i, f),
        None => (rest, ""),
    };
    let digits = |s: &str| s.bytes().all(|b| b.is_ascii_digit());
    if int.is_empty() || !digits(int) || !digits(frac) || (rest.contains('.') && frac.is_empty()) {
        return None;
    }
    Some((negative, int, frac))
}

fn digits_to_i128(int: &str, frac: &str, scale: u32) -> Option<i128> {
    let mut n: i128 = 0;
    for b in int.bytes().chain(frac.bytes()).chain(std::iter::repeat(b'0').take((scale as usize) - frac.len())) {
        n = n.checked_mul(10)?.checked_add((b - b'0') as i128)?;
    }
    Some(n)
}

/// Exact decimal string to minor units; never rounds.
pub fn to_minor(amount: &str, currency: &str) -> Result<i64, MoneyError> {
    let exp = exponent(currency)?;
    let Some((negative, int, frac)) = parse_decimal(amount) else {
        return err(format!("invalid amount: {amount:?}"));
    };
    if frac.len() > exp as usize {
        return err(format!("{currency} allows at most {exp} fraction digits: {amount:?}"));
    }
    let n = digits_to_i128(int, frac, exp).ok_or_else(|| MoneyError("amount out of range".into()))?;
    i64::try_from(if negative { -n } else { n }).or_else(|_| overflow())
}

/// Minor units to a plain decimal string (no symbol or grouping).
pub fn format_minor(minor: i64, currency: &str) -> Result<String, MoneyError> {
    let exp = exponent(currency)?;
    let sign = if minor < 0 { "-" } else { "" };
    let abs = minor.unsigned_abs();
    if exp == 0 {
        return Ok(format!("{sign}{abs}"));
    }
    let div = 10u64.pow(exp);
    Ok(format!("{sign}{}.{:0w$}", abs / div, abs % div, w = exp as usize))
}

/// Multiplies by a decimal rate (at most 9 fraction digits) and rounds half
/// to even on the exact product.
pub fn apply_rate(minor: i64, rate: &str) -> Result<i64, MoneyError> {
    let Some((negative, int, frac)) = parse_decimal(rate) else {
        return err(format!("invalid rate: {rate:?}"));
    };
    if frac.len() > 9 {
        return err("rate allows at most 9 fraction digits");
    }
    let num = digits_to_i128(int, frac, frac.len() as u32).ok_or_else(|| MoneyError("rate out of range".into()))?;
    let num = if negative { -num } else { num };
    let scale = 10i128.pow(frac.len() as u32);
    let product = (minor as i128).checked_mul(num).ok_or_else(|| MoneyError("amount out of range".into()))?;
    let abs = product.unsigned_abs();
    let scale = scale as u128;
    let (mut q, r) = (abs / scale, abs % scale);
    if 2 * r > scale || (2 * r == scale && q % 2 == 1) {
        q += 1;
    }
    let q = i128::try_from(q).or_else(|_| overflow())?;
    i64::try_from(if product < 0 { -q } else { q }).or_else(|_| overflow())
}

/// Splits `total` by non-negative integer ratios with the largest-remainder
/// method: shares are floor(|total| * r / sum) and leftover units go one each
/// to the entries with the largest remainder (|total| * r mod sum), ties to the
/// lower index. Negative totals are allocated by magnitude and negated. Sums to `total`.
pub fn allocate(total: i64, ratios: &[u64]) -> Result<Vec<i64>, MoneyError> {
    if ratios.is_empty() {
        return err("ratios must not be empty");
    }
    let sum = ratios.iter().try_fold(0u128, |acc, &r| acc.checked_add(r as u128));
    let sum = match sum {
        Some(s) if s > 0 => s,
        Some(_) => return err("ratios must have a positive sum"),
        None => return overflow(),
    };
    let abs = total.unsigned_abs() as u128;
    let mut shares: Vec<u128> = ratios.iter().map(|&r| abs * r as u128 / sum).collect();
    let remainder = abs - shares.iter().sum::<u128>();
    let mut order: Vec<usize> = (0..ratios.len()).collect();
    // Stable sort keeps lower indices first among equal remainders.
    order.sort_by(|&a, &b| (abs * ratios[b] as u128 % sum).cmp(&(abs * ratios[a] as u128 % sum)));
    for &i in order.iter().take(remainder as usize) {
        shares[i] += 1;
    }
    shares
        .into_iter()
        .map(|s| {
            let s = s as i128;
            i64::try_from(if total < 0 { -s } else { s }).or_else(|_| overflow())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn to_minor_vectors() {
        assert_eq!(to_minor("12.34", "USD").unwrap(), 1234);
        assert_eq!(to_minor("-0.5", "USD").unwrap(), -50);
        assert_eq!(to_minor("1000", "JPY").unwrap(), 1000);
        assert_eq!(to_minor("1.234", "BHD").unwrap(), 1234);
        assert_eq!(to_minor("7", "USD").unwrap(), 700);
        for (a, c) in [
            ("1.5", "JPY"),
            ("12.345", "USD"),
            ("1,000.00", "USD"),
            (".5", "USD"),
            ("5.", "USD"),
            ("1e3", "USD"),
            (" 1", "USD"),
            ("+1", "USD"),
            ("12", "XXX"),
            ("12", "usd"),
            ("99999999999999999999", "USD"),
        ] {
            assert!(to_minor(a, c).is_err(), "{a:?} {c}");
        }
    }

    #[test]
    fn format_vectors() {
        assert_eq!(format_minor(1234, "USD").unwrap(), "12.34");
        assert_eq!(format_minor(-5, "USD").unwrap(), "-0.05");
        assert_eq!(format_minor(500, "JPY").unwrap(), "500");
        assert_eq!(format_minor(1, "BHD").unwrap(), "0.001");
        assert_eq!(format_minor(0, "EUR").unwrap(), "0.00");
        assert_eq!(format_minor(i64::MIN, "USD").unwrap(), "-92233720368547758.08");
    }

    #[test]
    fn rate_vectors() {
        assert_eq!(apply_rate(1999, "0.0825").unwrap(), 165);
        assert_eq!(apply_rate(25, "0.5").unwrap(), 12);
        assert_eq!(apply_rate(35, "0.5").unwrap(), 18);
        assert_eq!(apply_rate(-25, "0.5").unwrap(), -12);
        assert_eq!(apply_rate(1000, "1.07").unwrap(), 1070);
        assert_eq!(apply_rate(25, "-0.5").unwrap(), -12);
        assert!(apply_rate(1, "0.0000000001").is_err());
        assert!(apply_rate(1, "1e3").is_err());
        assert!(apply_rate(i64::MAX, "2").is_err());
    }

    #[test]
    fn allocate_vectors() {
        assert_eq!(allocate(100, &[1, 1, 1]).unwrap(), vec![34, 33, 33]);
        assert_eq!(allocate(5, &[3, 7]).unwrap(), vec![2, 3]);
        assert_eq!(allocate(-100, &[1, 1, 1]).unwrap(), vec![-34, -33, -33]);
        assert_eq!(allocate(1000, &[0, 1]).unwrap(), vec![0, 1000]);
        assert_eq!(allocate(1, &[3, 7]).unwrap(), vec![0, 1]);
        assert_eq!(allocate(1, &[0, 1, 1]).unwrap(), vec![0, 1, 0]);
        assert_eq!(allocate(10, &[1, 8]).unwrap(), vec![1, 9]);
        assert!(allocate(1, &[]).is_err());
        assert!(allocate(1, &[0, 0]).is_err());
        assert_eq!(allocate(i64::MIN, &[1, 1]).unwrap().iter().map(|&v| v as i128).sum::<i128>(), i64::MIN as i128);
    }
}
