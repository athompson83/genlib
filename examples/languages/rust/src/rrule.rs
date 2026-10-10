// SPDX-License-Identifier: Apache-2.0

//! A UTC subset of RFC 5545 recurrence rules: FREQ DAILY/WEEKLY/MONTHLY/YEARLY
//! with INTERVAL, COUNT or UNTIL, BYDAY (ordinals only with MONTHLY or YEARLY),
//! BYMONTHDAY and BYMONTH with any frequency. Matches python-dateutil for every
//! rule it accepts; rejects BYSETPOS, WKST, BYHOUR and every other part rather
//! than silently ignoring them.

use std::collections::HashMap;
use std::fmt;

/// Conventional occurrence limit.
pub const DEFAULT_LIMIT: usize = 50;
/// Largest accepted limit.
pub const MAX_LIMIT: usize = 1000;
/// Bound on the number of days, weeks, months or years scanned.
pub const MAX_PERIODS: i64 = 100_000;

/// Invalid dtstart, rule or limit, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RRuleError(pub String);

impl fmt::Display for RRuleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RRuleError {}

fn err<T>(m: impl Into<String>) -> Result<T, RRuleError> {
    Err(RRuleError(m.into()))
}

const WEEKDAYS: [&str; 7] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Freq {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

struct Rule {
    freq: Freq,
    interval: i64,
    count: Option<usize>,
    until: Option<i64>,
    byday: Vec<(i64, i64)>,
    bymonthday: Vec<i64>,
    bymonth: Vec<i64>,
    /// YEARLY with an explicit BYMONTH: ordinals count within the month.
    month_scope: bool,
}

fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * ((m + 9) % 12) + 2) / 5 + d - 1;
    era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

/// 0 = Monday .. 6 = Sunday (day 0 = 1970-01-01, a Thursday).
fn weekday(day: i64) -> i64 {
    (day + 3).rem_euclid(7)
}

fn month_days(y: i64, m: i64) -> i64 {
    match m {
        2 if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

fn digits(s: &str) -> Option<i64> {
    if !s.is_empty() && s.len() <= 4 && s.bytes().all(|c| c.is_ascii_digit()) {
        s.parse().ok()
    } else {
        None
    }
}

/// Validates year, month, day, hour, minute, second digit fields.
fn stamp(f: [&str; 6]) -> Option<i64> {
    let mut v = [0i64; 6];
    for (slot, s) in v.iter_mut().zip(f) {
        *slot = digits(s)?;
    }
    let [y, mo, d, h, mi, s] = v;
    if y < 1 || !(1..=12).contains(&mo) || d < 1 || d > month_days(y, mo) || h > 23 || mi > 59 || s > 59 {
        return None;
    }
    Some(days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + s)
}

fn parse_start(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if !s.is_ascii() || b.len() != 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' || b[19] != b'Z' {
        return None;
    }
    stamp([&s[0..4], &s[5..7], &s[8..10], &s[11..13], &s[14..16], &s[17..19]])
}

fn parse_until(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if !s.is_ascii() || b.len() != 16 || b[8] != b'T' || b[15] != b'Z' {
        return None;
    }
    stamp([&s[0..4], &s[4..6], &s[6..8], &s[9..11], &s[11..13], &s[13..15]])
}

/// `[+-]?d{1,4}` with lo <= |n| <= hi; negatives only when `signed`.
fn number(s: &str, lo: i64, hi: i64, signed: bool) -> Result<i64, RRuleError> {
    let (neg, body) = match s.as_bytes().first() {
        Some(b'-') if signed => (true, &s[1..]),
        Some(b'+') => (false, &s[1..]),
        _ => (false, s),
    };
    match digits(body) {
        Some(n) if (lo..=hi).contains(&n) => Ok(if neg { -n } else { n }),
        _ => err(format!("number {s:?} is invalid or out of range")),
    }
}

fn numbers(s: &str, lo: i64, hi: i64, signed: bool) -> Result<Vec<i64>, RRuleError> {
    s.split(',').map(|x| number(x, lo, hi, signed)).collect()
}

fn parse_rule(text: &str) -> Result<Rule, RRuleError> {
    let mut parts: HashMap<&str, &str> = HashMap::new();
    for p in text.split(';') {
        let Some((k, v)) = p.split_once('=') else { return err(format!("malformed part {p:?}")) };
        if parts.insert(k, v).is_some() {
            return err(format!("duplicate part {k}"));
        }
    }
    if let Some(k) = parts.keys().find(|k| !["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH"].contains(k)) {
        return err(format!("unsupported part {k}"));
    }
    let freq = match parts.get("FREQ").copied() {
        Some("DAILY") => Freq::Daily,
        Some("WEEKLY") => Freq::Weekly,
        Some("MONTHLY") => Freq::Monthly,
        Some("YEARLY") => Freq::Yearly,
        _ => return err("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY"),
    };
    if parts.contains_key("COUNT") && parts.contains_key("UNTIL") {
        return err("COUNT and UNTIL are mutually exclusive");
    }
    let mut r = Rule { freq, interval: 1, count: None, until: None, byday: Vec::new(), bymonthday: Vec::new(), bymonth: Vec::new(), month_scope: false };
    if let Some(v) = parts.get("INTERVAL") {
        r.interval = number(v, 1, 9999, false)?;
    }
    if let Some(v) = parts.get("COUNT") {
        r.count = Some(number(v, 1, 9999, false)? as usize);
    }
    if let Some(v) = parts.get("UNTIL") {
        r.until = Some(parse_until(v).ok_or_else(|| RRuleError("UNTIL must be YYYYMMDDTHHMMSSZ".into()))?);
    }
    let month_scope = parts.contains_key("BYMONTH");
    if let Some(v) = parts.get("BYDAY") {
        for d in v.split(',') {
            let split = d.len().saturating_sub(2);
            let Some(wd) = d.get(split..).and_then(|w| WEEKDAYS.iter().position(|x| *x == w)) else { return err(format!("invalid BYDAY {d:?}")) };
            let prefix = &d[..split];
            let mut n = 0;
            if !prefix.is_empty() {
                let body = prefix.strip_prefix(['+', '-']).unwrap_or(prefix);
                if body.is_empty() || body.len() > 2 || !body.bytes().all(|c| c.is_ascii_digit()) {
                    return err(format!("invalid BYDAY ordinal {d:?}"));
                }
                n = body.parse::<i64>().map_err(|_| RRuleError(format!("invalid BYDAY ordinal {d:?}")))?;
                if prefix.starts_with('-') {
                    n = -n;
                }
                let lim = if freq == Freq::Monthly || (freq == Freq::Yearly && month_scope) { 5 } else { 53 };
                if !matches!(freq, Freq::Monthly | Freq::Yearly) || n == 0 || n.abs() > lim {
                    return err(format!("BYDAY ordinal {d:?} is not allowed here"));
                }
            }
            r.byday.push((n, wd as i64));
        }
        if r.byday.iter().any(|b| b.0 != 0) && r.byday.iter().any(|b| b.0 == 0) {
            return err("BYDAY cannot mix plain and ordinal weekdays");
        }
    }
    if let Some(v) = parts.get("BYMONTHDAY") {
        r.bymonthday = numbers(v, 1, 31, true)?;
    }
    if let Some(v) = parts.get("BYMONTH") {
        r.bymonth = numbers(v, 1, 12, false)?;
    }
    Ok(r)
}

fn format(t: i64) -> String {
    let (day, sec) = (t.div_euclid(86_400), t.rem_euclid(86_400));
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", sec / 3600, sec / 60 % 60, sec % 60)
}

const MAX_DAY: i64 = 2_932_896; // 9999-12-31

impl Rule {
    /// First day and length of period k; `None` once it starts after 9999-12-31.
    fn period(&self, start_day: i64, k: i64) -> Option<(i64, i64)> {
        let (sy, sm, _) = civil_from_days(start_day);
        let step = k * self.interval;
        let (first, n) = match self.freq {
            Freq::Daily => (start_day + step, 1),
            Freq::Weekly => (start_day - weekday(start_day) + 7 * step, 7),
            Freq::Monthly => {
                let mi = sm - 1 + step;
                let (y, mo) = (sy + mi / 12, mi % 12 + 1);
                if y > 9999 {
                    return None;
                }
                (days_from_civil(y, mo, 1), month_days(y, mo))
            }
            Freq::Yearly => {
                let y = sy + step;
                if y > 9999 {
                    return None;
                }
                (days_from_civil(y, 1, 1), days_from_civil(y + 1, 1, 1) - days_from_civil(y, 1, 1))
            }
        };
        if first > MAX_DAY {
            return None;
        }
        Some((first, n.min(MAX_DAY - first + 1)))
    }

    /// Whether `day` passes every filter (the dateutil defaults already applied).
    fn matches(&self, day: i64) -> bool {
        let (y, m, d) = civil_from_days(day);
        if !self.bymonth.is_empty() && !self.bymonth.contains(&m) {
            return false;
        }
        let nd = month_days(y, m);
        if !self.bymonthday.is_empty() && !self.bymonthday.iter().any(|&x| d == if x > 0 { x } else { nd + x + 1 }) {
            return false;
        }
        if self.byday.is_empty() {
            return true;
        }
        let wd = weekday(day);
        self.byday.iter().any(|&(n, w)| {
            if w != wd {
                return false;
            }
            if n == 0 {
                return true;
            }
            // Ordinals count within the month (MONTHLY, or YEARLY with BYMONTH)
            // or within the whole year.
            let (first, last) = if self.freq == Freq::Monthly || self.month_scope {
                (day - (d - 1), day - d + nd)
            } else {
                (days_from_civil(y, 1, 1), days_from_civil(y, 12, 31))
            };
            if n > 0 {
                (day - first) / 7 + 1 == n
            } else {
                (last - day) / 7 + 1 == -n
            }
        })
    }
}

/// Returns up to `limit` (1..=1000; use [`DEFAULT_LIMIT`]) occurrences of
/// `rule` starting at `dtstart` (`YYYY-MM-DDTHH:MM:SSZ`), formatted the same
/// way. Occurrences keep dtstart's time; dtstart itself is included only when
/// it matches the rule.
pub fn expand_rrule(dtstart: &str, rule: &str, limit: usize) -> Result<Vec<String>, RRuleError> {
    if !(1..=MAX_LIMIT).contains(&limit) {
        return err("limit must be in 1..=1000");
    }
    let Some(start) = parse_start(dtstart) else { return err("dtstart must be YYYY-MM-DDTHH:MM:SSZ") };
    let mut r = parse_rule(rule)?;
    let (start_day, tod) = (start.div_euclid(86_400), start.rem_euclid(86_400));
    r.month_scope = r.freq == Freq::Yearly && !r.bymonth.is_empty();
    if r.byday.is_empty() && r.bymonthday.is_empty() {
        let (_, sm, sd) = civil_from_days(start_day);
        match r.freq {
            Freq::Daily => {}
            Freq::Weekly => r.byday = vec![(0, weekday(start_day))],
            Freq::Monthly => r.bymonthday = vec![sd],
            Freq::Yearly => {
                r.bymonthday = vec![sd];
                if r.bymonth.is_empty() {
                    r.bymonth = vec![sm];
                }
            }
        }
    }
    let mut out = Vec::new();
    for k in 0..MAX_PERIODS {
        let Some((first, n)) = r.period(start_day, k) else { break };
        for d in first..first + n {
            if !r.matches(d) {
                continue;
            }
            let c = d * 86_400 + tod;
            if c < start {
                continue;
            }
            if r.until.is_some_and(|u| c > u) {
                return Ok(out);
            }
            out.push(format(c));
            if r.count.is_some_and(|n| out.len() >= n) || out.len() >= limit {
                return Ok(out);
            }
        }
        if r.until.is_some_and(|u| first * 86_400 + tod > u) {
            break;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cases() {
        let cases: [(&str, &str, Vec<&str>); 28] = [
            ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5", vec!["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z"]),
            ("2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", vec!["2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z"]),
            ("2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z", vec!["2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z"]),
            ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4", vec!["2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z"]),
            ("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6", vec!["2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z"]),
            ("2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6", vec!["2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z"]),
            ("2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3", vec!["2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z"]),
            ("2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5", vec!["2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z"]),
            ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3", vec!["2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z"]),
            ("2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2", vec!["2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"]),
            ("2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z", vec!["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z"]),
            ("2026-10-12T07:00:00Z", "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=8", vec!["2026-10-12T07:00:00Z", "2026-10-13T07:00:00Z", "2026-10-14T07:00:00Z", "2026-10-15T07:00:00Z", "2026-10-16T07:00:00Z", "2026-10-19T07:00:00Z", "2026-10-20T07:00:00Z", "2026-10-21T07:00:00Z"]),
            ("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=3", vec!["2026-02-13T00:00:00Z", "2026-03-13T00:00:00Z", "2026-11-13T00:00:00Z"]),
            ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=3", vec!["2026-11-26T09:00:00Z", "2027-11-25T09:00:00Z", "2028-11-23T09:00:00Z"]),
            ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYDAY=1MO;COUNT=3", vec!["2026-01-05T09:00:00Z", "2027-01-04T09:00:00Z", "2028-01-03T09:00:00Z"]),
            ("2026-01-01T09:00:00Z", "FREQ=YEARLY;BYDAY=-1SU;COUNT=2", vec!["2026-12-27T09:00:00Z", "2027-12-26T09:00:00Z"]),
            ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYDAY=20MO;COUNT=2", vec!["2026-05-18T10:00:00Z", "2027-05-17T10:00:00Z"]),
            ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYDAY=MO;BYMONTH=2;COUNT=5", vec!["2026-02-02T10:00:00Z", "2026-02-09T10:00:00Z", "2026-02-16T10:00:00Z", "2026-02-23T10:00:00Z", "2027-02-01T10:00:00Z"]),
            ("2026-01-01T10:00:00Z", "FREQ=YEARLY;BYMONTHDAY=-1;COUNT=4", vec!["2026-01-31T10:00:00Z", "2026-02-28T10:00:00Z", "2026-03-31T10:00:00Z", "2026-04-30T10:00:00Z"]),
            ("2026-03-05T10:00:00Z", "FREQ=YEARLY;BYMONTHDAY=1,15;BYMONTH=6;COUNT=4", vec!["2026-06-01T10:00:00Z", "2026-06-15T10:00:00Z", "2027-06-01T10:00:00Z", "2027-06-15T10:00:00Z"]),
            ("2026-01-05T08:00:00Z", "FREQ=WEEKLY;BYMONTH=1,7;BYDAY=MO;COUNT=6", vec!["2026-01-05T08:00:00Z", "2026-01-12T08:00:00Z", "2026-01-19T08:00:00Z", "2026-01-26T08:00:00Z", "2026-07-06T08:00:00Z", "2026-07-13T08:00:00Z"]),
            ("2026-01-01T08:00:00Z", "FREQ=DAILY;BYMONTHDAY=1,-1;COUNT=5", vec!["2026-01-01T08:00:00Z", "2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z"]),
            ("2026-01-01T08:00:00Z", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=29;COUNT=2", vec!["2028-02-29T08:00:00Z", "2032-02-29T08:00:00Z"]),
            ("2026-05-20T08:00:00Z", "FREQ=MONTHLY;BYMONTH=6,12;COUNT=4", vec!["2026-06-20T08:00:00Z", "2026-12-20T08:00:00Z", "2027-06-20T08:00:00Z", "2027-12-20T08:00:00Z"]),
            ("2026-01-31T08:00:00Z", "FREQ=MONTHLY;BYDAY=MO;BYMONTH=3;COUNT=5", vec!["2026-03-02T08:00:00Z", "2026-03-09T08:00:00Z", "2026-03-16T08:00:00Z", "2026-03-23T08:00:00Z", "2026-03-30T08:00:00Z"]),
            ("2026-06-01T08:00:00Z", "FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=29;COUNT=2", vec!["2028-02-29T08:00:00Z", "2032-02-29T08:00:00Z"]),
            ("2026-10-12T09:00:00Z", "FREQ=WEEKLY;BYDAY=SA,SU;UNTIL=20261101T090000Z", vec!["2026-10-17T09:00:00Z", "2026-10-18T09:00:00Z", "2026-10-24T09:00:00Z", "2026-10-25T09:00:00Z", "2026-10-31T09:00:00Z", "2026-11-01T09:00:00Z"]),
            ("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYDAY=+1MO,-1FR;COUNT=4", vec!["2026-01-05T00:00:00Z", "2026-01-30T00:00:00Z", "2026-02-02T00:00:00Z", "2026-02-27T00:00:00Z"]),
        ];
        for (start, rule, want) in cases {
            assert_eq!(expand_rrule(start, rule, DEFAULT_LIMIT), Ok(want.iter().map(|s| s.to_string()).collect()), "{start} {rule}");
        }
    }

    #[test]
    fn invalid() {
        for rule in [
            "FREQ=HOURLY", "COUNT=3", "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=DAILY;BYDAY=1MO", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=MONTHLY;BYMONTHDAY=0", "FREQ=MONTHLY;BYSETPOS=1", "FREQ=WEEKLY;WKST=MO", "FREQ=WEEKLY;INTERVAL=0", "FREQ=WEEKLY;INTERVAL=-1", "FREQ=MONTHLY;BYDAY=6MO", "FREQ=YEARLY;BYMONTH=1;BYDAY=6MO", "FREQ=YEARLY;BYDAY=54MO", "FREQ=MONTHLY;BYDAY=0MO", "FREQ=MONTHLY;BYDAY=MO,1TU", "FREQ=YEARLY;BYMONTH=13", "FREQ=YEARLY;BYMONTH=-1", "FREQ=YEARLY;UNTIL=2026-12-31", "FREQ=DAILY;FREQ=DAILY", "FREQ=WEEKLY;BYDAY=XX", "FREQ=DAILY;BYHOUR=9",
            "", "FREQ=WEEKLY;COUNT=-3", "FREQ=MONTHLY;BYDAY=1MO,MO", "FREQ=MONTHLY;BYDAY=001MO", "FREQ=MONTHLY;BYDAY=1é",
        ] {
            assert!(expand_rrule("2026-01-01T00:00:00Z", rule, DEFAULT_LIMIT).is_err(), "{rule}");
        }
        for start in ["2026-01-01 00:00:00Z", "2026-02-30T00:00:00Z", "2026-01-01T24:00:00Z", "2026-01-01T00:00:00", "2026-01-01T00:00:0éZ"] {
            assert!(expand_rrule(start, "FREQ=DAILY", 1).is_err(), "{start}");
        }
        for limit in [0, 1001] {
            assert!(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY", limit).is_err());
        }
    }

    #[test]
    fn widened() {
        for rule in ["FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1", "FREQ=YEARLY;BYDAY=20MO"] {
            assert!(expand_rrule("2026-01-01T00:00:00Z", rule, DEFAULT_LIMIT).is_ok(), "{rule}");
        }
        assert_eq!(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30;COUNT=1", DEFAULT_LIMIT), Ok(vec![]));
    }

    #[test]
    fn limits() {
        assert_eq!(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY", 3).unwrap().len(), 3);
        assert_eq!(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY", DEFAULT_LIMIT).unwrap().len(), DEFAULT_LIMIT);
        assert!(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY;UNTIL=20251231T000000Z", 5).unwrap().is_empty());
        assert_eq!(expand_rrule("9999-12-30T00:00:00Z", "FREQ=DAILY", 5).unwrap().len(), 2);
    }
}
