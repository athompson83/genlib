// SPDX-License-Identifier: Apache-2.0

//! Next run time for a standard 5-field cron expression, evaluated in UTC.
//! Fields: minute, hour, day-of-month, month, day-of-week (0 and 7 = Sunday);
//! each a comma list of `*`, `N` or `A-B` with optional `/step`. When both
//! day fields are restricted a day matches if EITHER matches (Vixie cron).

use std::fmt;

/// Expression, timestamp or search error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CronError(pub String);

impl fmt::Display for CronError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CronError {}

fn err<T>(m: impl Into<String>) -> Result<T, CronError> {
    Err(CronError(m.into()))
}

const SEARCH_DAYS: i64 = 5 * 366;

fn number(s: &str, name: &str, min: u32, max: u32) -> Result<u32, CronError> {
    if s.is_empty() || s.len() > 2 || !s.bytes().all(|b| b.is_ascii_digit()) {
        return err(format!("invalid {name} value {s:?}"));
    }
    let n: u32 = s.parse().map_err(|_| CronError(format!("invalid {name} value {s:?}")))?;
    if n < min || n > max {
        return err(format!("{name} value {n} is outside {min}-{max}"));
    }
    Ok(n)
}

/// Parses one field into a bitset of allowed values.
fn field(text: &str, name: &str, min: u32, max: u32) -> Result<u64, CronError> {
    let mut bits = 0u64;
    for item in text.split(',') {
        let (range, step) = match item.split_once('/') {
            Some((r, s)) => {
                let step = number(s, name, 1, max.max(1)).map_err(|_| CronError(format!("invalid {name} step {s:?}")))?;
                (r, Some(step))
            }
            None => (item, None),
        };
        let (lo, hi) = if range == "*" {
            (min, max)
        } else if let Some((a, b)) = range.split_once('-') {
            let (a, b) = (number(a, name, min, max)?, number(b, name, min, max)?);
            if a > b {
                return err(format!("{name} range {range:?} is reversed"));
            }
            (a, b)
        } else {
            let n = number(range, name, min, max)?;
            (n, if step.is_some() { max } else { n })
        };
        let mut v = lo;
        while v <= hi {
            bits |= 1 << v;
            v += step.unwrap_or(1);
        }
    }
    Ok(bits)
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

fn days_in_month(y: i64, m: i64) -> i64 {
    days_from_civil(if m == 12 { y + 1 } else { y }, if m == 12 { 1 } else { m + 1 }, 1) - days_from_civil(y, m, 1)
}

fn digits(s: &str) -> Option<i64> {
    (!s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())).then(|| s.parse().ok()).flatten()
}

/// Parses `YYYY-MM-DDTHH:MM[:SS[.fff]]Z` to whole minutes since the epoch (seconds truncated).
fn parse_utc_minutes(s: &str) -> Result<i64, CronError> {
    let bad = || CronError(format!("after must be an ISO-8601 UTC time like 2026-10-10T12:00:00Z: {s:?}"));
    let b = s.as_bytes();
    if b.len() < 17 || !s.is_ascii() || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || !s.ends_with('Z') {
        return Err(bad());
    }
    let tail = &s[16..s.len() - 1];
    if !tail.is_empty() {
        let secs = tail.strip_prefix(':').ok_or_else(bad)?;
        let (whole, frac) = secs.split_once('.').unwrap_or((secs, "0"));
        if whole.len() != 2 || digits(whole).ok_or_else(bad)? > 59 || digits(frac).is_none() {
            return Err(bad());
        }
    }
    let (y, mo, d) = (digits(&s[..4]).ok_or_else(bad)?, digits(&s[5..7]).ok_or_else(bad)?, digits(&s[8..10]).ok_or_else(bad)?);
    let (h, mi) = (digits(&s[11..13]).ok_or_else(bad)?, digits(&s[14..16]).ok_or_else(bad)?);
    if !(1..=12).contains(&mo) || d < 1 || d > days_in_month(y, mo) || h > 23 || mi > 59 {
        return Err(bad());
    }
    Ok((days_from_civil(y, mo, d) * 24 + h) * 60 + mi)
}

struct Schedule {
    minute: u64,
    hour: u64,
    dom: u64,
    month: u64,
    dow: u64,
    either_day: bool,
}

fn parse_expression(expression: &str) -> Result<Schedule, CronError> {
    let f: Vec<&str> = expression.split_whitespace().collect();
    if f.len() != 5 {
        return err("cron expression must have 5 fields: minute hour day-of-month month day-of-week");
    }
    let mut dow = field(f[4], "day-of-week", 0, 7)?;
    if dow & (1 << 7) != 0 {
        dow = (dow | 1) & !(1 << 7);
    }
    Ok(Schedule {
        minute: field(f[0], "minute", 0, 59)?,
        hour: field(f[1], "hour", 0, 23)?,
        dom: field(f[2], "day-of-month", 1, 31)?,
        month: field(f[3], "month", 1, 12)?,
        dow,
        either_day: !f[2].starts_with('*') && !f[4].starts_with('*'),
    })
}

/// First minute strictly after `after_iso_utc` matching `expression`, as `YYYY-MM-DDTHH:MM:00Z`.
/// Errors if nothing matches within 5 years (for example `0 0 31 2 *`).
pub fn next_run(expression: &str, after_iso_utc: &str) -> Result<String, CronError> {
    let s = parse_expression(expression)?;
    let start = parse_utc_minutes(after_iso_utc)? + 1;
    let limit = start + SEARCH_DAYS * 1440;
    let mut t = start;
    while t <= limit {
        let days = t.div_euclid(1440);
        let (y, m, d) = civil_from_days(days);
        if s.month & (1 << m) == 0 {
            let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
            t = days_from_civil(ny, nm, 1) * 1440;
            continue;
        }
        let weekday = (days + 4).rem_euclid(7);
        let (dom_ok, dow_ok) = (s.dom & (1 << d) != 0, s.dow & (1 << weekday) != 0);
        if !(if s.either_day { dom_ok || dow_ok } else { dom_ok && dow_ok }) {
            t = (days + 1) * 1440;
            continue;
        }
        let minute_of_day = t.rem_euclid(1440);
        let (h, mi) = (minute_of_day / 60, minute_of_day % 60);
        if s.hour & (1 << h) == 0 {
            t = days * 1440 + (h + 1) * 60;
            continue;
        }
        if s.minute & (1 << mi) == 0 {
            t += 1;
            continue;
        }
        if !(0..=9999).contains(&y) {
            return err("next run is outside years 0000-9999");
        }
        return Ok(format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:00Z"));
    }
    err("no matching time within 5 years")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vectors() {
        let cases = [
            ("*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"),
            ("0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"),
            ("30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"),
            ("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"),
            ("0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"),
            ("59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"),
            ("0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
            ("5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"),
        ];
        for (expr, after, want) in cases {
            assert_eq!(next_run(expr, after).unwrap(), want, "{expr}");
        }
    }

    #[test]
    fn extra_behaviour() {
        assert_eq!(next_run("0 0 * * 7", "2026-10-10T00:00:00Z").unwrap(), "2026-10-11T00:00:00Z");
        assert_eq!(next_run("10/20 * * * *", "2026-10-10T12:31:00Z").unwrap(), "2026-10-10T12:50:00Z");
        assert_eq!(next_run("* * * * *", "2026-10-10T12:00:59.999Z").unwrap(), "2026-10-10T12:01:00Z");
        assert_eq!(next_run("0 0 13 * 5", "2026-10-14T00:00:00Z").unwrap(), "2026-10-16T00:00:00Z");
        // `*/10` starts with `*`, so both day fields must match (1st/11th/21st/31st that is a Friday).
        assert_eq!(next_run("0 0 */10 * 5", "2026-10-10T00:00:00Z").unwrap(), "2026-12-11T00:00:00Z");
    }

    #[test]
    fn rejections() {
        for bad in ["* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8", "*/0 * * * *",
            "5-1 * * * *", "MON * * * *", "* * * * MON", "? * * * *", "1,,2 * * * *"]
        {
            assert!(next_run(bad, "2026-10-10T00:00:00Z").is_err(), "{bad}");
        }
        assert!(next_run("0 0 31 2 *", "2026-10-10T00:00:00Z").is_err());
        for bad in ["2026-10-10 00:00:00Z", "2026-13-10T00:00:00Z", "2026-02-30T00:00:00Z", "2026-10-10T00:00:00", "x"] {
            assert!(next_run("* * * * *", bad).is_err(), "{bad}");
        }
    }
}
