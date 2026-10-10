// SPDX-License-Identifier: Apache-2.0

//! Business-day arithmetic over strict ISO dates (YYYY-MM-DD, years
//! 0001-9999, proleptic Gregorian) with configurable weekend days (MO..SU,
//! not all seven) and holidays.

use std::collections::HashSet;
use std::fmt;

/// Invalid date, weekend, holiday or day count.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BusinessDayError(pub String);

impl fmt::Display for BusinessDayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for BusinessDayError {}

fn err<T>(m: &str) -> Result<T, BusinessDayError> {
    Err(BusinessDayError(m.to_string()))
}

/// Saturday and Sunday.
pub const DEFAULT_WEEKEND: [&str; 2] = ["SA", "SU"];
/// Largest accepted |n| for [`add_business_days`].
pub const MAX_N: i64 = 100_000;

const WEEKDAYS: [&str; 7] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn min_day() -> i64 {
    days_from_civil(1, 1, 1)
}

fn max_day() -> i64 {
    days_from_civil(9999, 12, 31)
}

/// 0 = Monday.
fn weekday(day: i64) -> usize {
    (day + 3).rem_euclid(7) as usize
}

fn parse(s: &str) -> Result<i64, BusinessDayError> {
    let b = s.as_bytes();
    let shape = b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
    if !shape {
        return err("date must be YYYY-MM-DD");
    }
    let num = |r: std::ops::Range<usize>| s[r].parse::<i64>().unwrap_or(0);
    let (y, m, d) = (num(0..4), num(5..7), num(8..10));
    if y < 1 || !(1..=12).contains(&m) || d < 1 {
        return err("date must be a valid YYYY-MM-DD");
    }
    let day = days_from_civil(y, m, d);
    if civil_from_days(day) != (y, m, d) {
        return err("date must be a valid YYYY-MM-DD");
    }
    Ok(day)
}

fn format(day: i64) -> Result<String, BusinessDayError> {
    if day < min_day() || day > max_day() {
        return err("date out of range");
    }
    let (y, m, d) = civil_from_days(day);
    Ok(format!("{y:04}-{m:02}-{d:02}"))
}

struct Cfg {
    holidays: HashSet<i64>,
    weekend: [bool; 7],
    n_weekend: i64,
}

impl Cfg {
    fn new(holidays: &[&str], weekend: &[&str]) -> Result<Cfg, BusinessDayError> {
        let mut c = Cfg { holidays: HashSet::new(), weekend: [false; 7], n_weekend: 0 };
        for w in weekend {
            let Some(i) = WEEKDAYS.iter().position(|x| x == w) else {
                return err("weekend days are MO..SU");
            };
            if !c.weekend[i] {
                c.weekend[i] = true;
                c.n_weekend += 1;
            }
        }
        if c.n_weekend == 7 {
            return err("weekend cannot be every day");
        }
        for h in holidays {
            c.holidays.insert(parse(h)?);
        }
        Ok(c)
    }

    fn ok(&self, day: i64) -> bool {
        !self.weekend[weekday(day)] && !self.holidays.contains(&day)
    }
}

/// True when `date` is neither a weekend day nor a holiday (pass `&DEFAULT_WEEKEND` for Saturday/Sunday).
pub fn is_business_day(date: &str, holidays: &[&str], weekend: &[&str]) -> Result<bool, BusinessDayError> {
    let c = Cfg::new(holidays, weekend)?;
    Ok(c.ok(parse(date)?))
}

/// The date `n` business days after `date` (before it when n < 0); n == 0 returns `date` when it is a business day, else the next one.
pub fn add_business_days(date: &str, n: i64, holidays: &[&str], weekend: &[&str]) -> Result<String, BusinessDayError> {
    if !(-MAX_N..=MAX_N).contains(&n) {
        return err("n must be within ±100000");
    }
    let c = Cfg::new(holidays, weekend)?;
    let mut d = parse(date)?;
    let (lo, hi) = (min_day(), max_day());
    if n == 0 {
        while !c.ok(d) {
            d += 1;
            if d > hi {
                return err("date out of range");
            }
        }
        return format(d);
    }
    let step = n.signum();
    let mut left = n.abs();
    while left > 0 {
        d += step;
        if d < lo || d > hi {
            return err("date out of range");
        }
        if c.ok(d) {
            left -= 1;
        }
    }
    format(d)
}

/// Business days in [start, end) (start counted, end not); negative when end is before start.
pub fn business_days_between(start: &str, end: &str, holidays: &[&str], weekend: &[&str]) -> Result<i64, BusinessDayError> {
    let c = Cfg::new(holidays, weekend)?;
    let (mut a, mut b) = (parse(start)?, parse(end)?);
    let mut sign = 1;
    if b < a {
        std::mem::swap(&mut a, &mut b);
        sign = -1;
    }
    let days = b - a;
    let (full, rem) = (days / 7, days % 7);
    let mut count = full * (7 - c.n_weekend);
    for i in 0..rem {
        if !c.weekend[weekday(a + full * 7 + i)] {
            count += 1;
        }
    }
    count -= c.holidays.iter().filter(|&&h| a <= h && h < b && !c.weekend[weekday(h)]).count() as i64;
    Ok(sign * count)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn is_vectors() {
        let cases: &[(&str, &[&str], &[&str], bool)] = &[
            ("2026-10-10", &[], &["SA", "SU"], false),
            ("2026-10-12", &[], &["SA", "SU"], true),
            ("2026-12-25", &["2026-12-25", "2026-12-28", "2027-01-01"], &["SA", "SU"], false),
            ("2026-10-16", &[], &["FR", "SA"], false),
        ];
        for &(date, h, w, want) in cases {
            assert_eq!(is_business_day(date, h, w).unwrap(), want, "{date}");
        }
    }

    #[test]
    fn add_vectors() {
        type Case<'a> = (&'a str, i64, &'a [&'a str], &'a [&'a str], &'a str);
        let cases: &[Case] = &[
            ("2026-10-09", 1, &[], &["SA", "SU"], "2026-10-12"),
            ("2026-10-12", -1, &[], &["SA", "SU"], "2026-10-09"),
            ("2026-10-10", 0, &[], &["SA", "SU"], "2026-10-12"),
            ("2026-10-12", 0, &[], &["SA", "SU"], "2026-10-12"),
            ("2026-12-23", 3, &["2026-12-25", "2026-12-28", "2027-01-01"], &["SA", "SU"], "2026-12-30"),
            ("2026-12-31", -5, &["2026-12-25", "2026-12-28", "2027-01-01"], &["SA", "SU"], "2026-12-22"),
            ("2028-02-28", 1, &[], &["SA", "SU"], "2028-02-29"),
            ("2026-10-14", 10, &[], &["FR", "SA"], "2026-10-28"),
            ("2026-01-01", 260, &[], &["SA", "SU"], "2026-12-31"),
            ("2026-10-11", 0, &[], &[], "2026-10-11"),
        ];
        for &(date, n, h, w, want) in cases {
            assert_eq!(add_business_days(date, n, h, w).unwrap(), want, "{date} {n}");
        }
    }

    #[test]
    fn between_vectors() {
        type Case<'a> = (&'a str, &'a str, &'a [&'a str], &'a [&'a str], i64);
        let cases: &[Case] = &[
            ("2026-10-01", "2026-11-01", &["2026-10-12"], &["SA", "SU"], 21),
            ("2026-11-01", "2026-10-01", &[], &["SA", "SU"], -22),
            ("2026-10-12", "2026-10-12", &[], &["SA", "SU"], 0),
            ("2026-12-21", "2027-01-04", &["2026-12-25", "2026-12-28", "2027-01-01"], &["SA", "SU"], 7),
            ("2026-01-01", "2027-01-01", &[], &["SA", "SU"], 261),
            ("2026-10-01", "2026-10-31", &[], &["FR", "SA"], 21),
            ("2026-10-10", "2026-10-12", &["2026-10-11"], &["SA", "SU"], 0),
        ];
        for &(a, b, h, w, want) in cases {
            assert_eq!(business_days_between(a, b, h, w).unwrap(), want, "{a} {b}");
        }
    }

    #[test]
    fn invalid() {
        assert!(add_business_days("2026-02-30", 1, &[], &DEFAULT_WEEKEND).is_err());
        assert!(add_business_days("2026-1-01", 1, &[], &DEFAULT_WEEKEND).is_err());
        assert!(add_business_days("2026-01-01", 100001, &[], &DEFAULT_WEEKEND).is_err());
        assert!(is_business_day("2026-10-10", &[], &["MO", "TU", "WE", "TH", "FR", "SA", "SU"]).is_err());
        assert!(is_business_day("2026-10-10", &[], &["XX"]).is_err());
        assert!(add_business_days("9999-12-31", 1, &[], &DEFAULT_WEEKEND).is_err());
    }
}
