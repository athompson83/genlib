// SPDX-License-Identifier: Apache-2.0

//! ISO 8601 week dates (weeks start on Monday; week 1 contains the year's first
//! Thursday) in the proleptic Gregorian calendar, years 1..9999, computed with
//! plain day arithmetic.

use std::fmt;

/// Invalid date, out-of-range week or malformed week string.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IsoWeekError(pub String);

impl fmt::Display for IsoWeekError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "iso week: {}", self.0)
    }
}

impl std::error::Error for IsoWeekError {}

fn err<T>(m: &str) -> Result<T, IsoWeekError> {
    Err(IsoWeekError(m.to_string()))
}

fn is_leap(y: i64) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        2 if is_leap(y) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 0001-01-01 (day 0, a Monday).
fn day_number(y: i64, m: i64, d: i64) -> i64 {
    let y1 = y - 1;
    y1 * 365 + y1 / 4 - y1 / 100 + y1 / 400 + (1..m).map(|k| days_in_month(y, k)).sum::<i64>() + d - 1
}

fn from_day_number(mut n: i64) -> (i64, i64, i64) {
    let mut y = n / 366 + 1;
    while day_number(y + 1, 1, 1) <= n {
        y += 1;
    }
    n -= day_number(y, 1, 1);
    let mut m = 1;
    while n >= days_in_month(y, m) {
        n -= days_in_month(y, m);
        m += 1;
    }
    (y, m, n + 1)
}

fn valid_date(y: i32, m: u32, d: u32) -> bool {
    (1..=9999).contains(&y) && (1..=12).contains(&m) && d >= 1 && (d as i64) <= days_in_month(y as i64, m as i64)
}

fn iso_of(y: i64, m: i64, d: i64) -> (i32, u32, u32) {
    let n = day_number(y, m, d);
    let wd = n % 7 + 1;
    let thursday = n + 4 - wd;
    let (ty, _, _) = from_day_number(thursday);
    (ty as i32, ((thursday - day_number(ty, 1, 1)) / 7 + 1) as u32, wd as u32)
}

/// Returns the ISO week-numbering year, week (1..53) and weekday (1=Monday..7=Sunday) of a date.
pub fn iso_week(year: i32, month: u32, day: u32) -> Result<(i32, u32, u32), IsoWeekError> {
    if !valid_date(year, month, day) {
        return err("invalid date");
    }
    Ok(iso_of(year as i64, month as i64, day as i64))
}

/// Returns 52 or 53, the number of ISO weeks in week-numbering year `year`.
pub fn weeks_in_year(year: i32) -> Result<u32, IsoWeekError> {
    if !(1..=9999).contains(&year) {
        return err("year out of range");
    }
    Ok(iso_of(year as i64, 12, 28).1)
}

/// Returns the calendar date (year, month, day) of an ISO week date.
pub fn from_iso_week(week_year: i32, week: u32, weekday: u32) -> Result<(i32, u32, u32), IsoWeekError> {
    if !(1..=9999).contains(&week_year) || !(1..=7).contains(&weekday) || week < 1 || week > weeks_in_year(week_year)? {
        return err("invalid ISO week date");
    }
    let jan4 = day_number(week_year as i64, 1, 4);
    let n = jan4 - jan4 % 7 + (week as i64 - 1) * 7 + weekday as i64 - 1;
    let (y, m, d) = from_day_number(n);
    if !(1..=9999).contains(&y) {
        return err("year out of range");
    }
    Ok((y as i32, m as u32, d as u32))
}

/// Renders a date as "YYYY-Www-D".
pub fn format_iso_week(year: i32, month: u32, day: u32) -> Result<String, IsoWeekError> {
    let (wy, w, wd) = iso_week(year, month, day)?;
    Ok(format!("{wy:04}-W{w:02}-{wd}"))
}

/// Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) into a calendar date.
pub fn parse_iso_week(s: &str) -> Result<(i32, u32, u32), IsoWeekError> {
    let bad = || IsoWeekError("not an ISO week date".to_string());
    let b = s.as_bytes();
    let num = |x: &[u8]| -> Option<u32> { x.iter().try_fold(0u32, |a, &c| c.is_ascii_digit().then(|| a * 10 + (c - b'0') as u32)) };
    if b.len() < 7 {
        return Err(bad());
    }
    let wy = num(&b[..4]).ok_or_else(bad)?;
    let mut rest = &b[4..];
    if rest[0] == b'-' {
        rest = &rest[1..];
    }
    if rest.len() < 3 || rest[0] != b'W' {
        return Err(bad());
    }
    let w = num(&rest[1..3]).ok_or_else(bad)?;
    rest = &rest[3..];
    let mut wd = 1;
    if !rest.is_empty() {
        if rest[0] == b'-' {
            rest = &rest[1..];
        }
        if rest.len() != 1 || !(b'1'..=b'7').contains(&rest[0]) {
            return Err(bad());
        }
        wd = (rest[0] - b'0') as u32;
    }
    from_iso_week(wy as i32, w, wd)
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn iso_week_vectors() {
        let cases: &[((i32, u32, u32), (i32, u32, u32), &str)] = &[
            ((2021, 1, 3), (2020, 53, 7), "2020-W53-7"),
            ((2021, 1, 4), (2021, 1, 1), "2021-W01-1"),
            ((2020, 12, 31), (2020, 53, 4), "2020-W53-4"),
            ((2026, 10, 11), (2026, 41, 7), "2026-W41-7"),
            ((2008, 12, 29), (2009, 1, 1), "2009-W01-1"),
            ((2010, 1, 3), (2009, 53, 7), "2009-W53-7"),
            ((2015, 12, 31), (2015, 53, 4), "2015-W53-4"),
            ((2016, 1, 1), (2015, 53, 5), "2015-W53-5"),
            ((2024, 12, 30), (2025, 1, 1), "2025-W01-1"),
            ((1, 1, 1), (1, 1, 1), "0001-W01-1"),
            ((9999, 12, 31), (9999, 52, 5), "9999-W52-5"),
        ];
        for &((y, m, d), week, text) in cases {
            assert_eq!(iso_week(y, m, d), Ok(week));
            assert_eq!(format_iso_week(y, m, d).as_deref(), Ok(text));
            assert_eq!(from_iso_week(week.0, week.1, week.2), Ok((y, m, d)));
            assert_eq!(parse_iso_week(text), Ok((y, m, d)));
        }
        for (y, m, d) in [(2021, 2, 29), (0, 1, 1), (10000, 1, 1), (2026, 13, 1), (2026, 4, 31)] {
            assert!(iso_week(y, m, d).is_err(), "{y}-{m}-{d}");
        }
    }

    #[test]
    fn weeks_in_year_vectors() {
        for (y, n) in [(2015, 53), (2016, 52), (2020, 53), (2021, 52), (2026, 53), (2032, 53), (2037, 53)] {
            assert_eq!(weeks_in_year(y), Ok(n), "{y}");
        }
        assert!(weeks_in_year(0).is_err());
    }

    #[test]
    fn from_iso_week_vectors() {
        for (a, r) in [((2020, 53, 5), (2021, 1, 1)), ((2026, 1, 1), (2025, 12, 29)), ((2009, 1, 1), (2008, 12, 29))] {
            assert_eq!(from_iso_week(a.0, a.1, a.2), Ok(r));
        }
        for (wy, w, wd) in [(2021, 53, 1), (2026, 0, 1), (2026, 1, 0), (2026, 1, 8), (0, 1, 1), (9999, 52, 6)] {
            assert!(from_iso_week(wy, w, wd).is_err());
        }
    }

    #[test]
    fn parse_vectors() {
        for (s, r) in [("2026-W41-7", (2026, 10, 11)), ("2026W417", (2026, 10, 11)), ("2026-W41", (2026, 10, 5)), ("2020-W53-5", (2021, 1, 1))] {
            assert_eq!(parse_iso_week(s), Ok(r), "{s:?}");
        }
        for s in &["2021-W53-1", "2026-W00-1", "2026-W10-8", "26-W10-1", "2026-w10-1", "2026-W1-1"] {
            assert!(parse_iso_week(s).is_err(), "{s:?}");
        }
    }
}
