// SPDX-License-Identifier: Apache-2.0

//! ISO 8601 durations such as `P1DT2H30M` and `PT0.5S`, hand-parsed. Years and
//! months are calendar dependent: they parse but have no exact length. Weeks
//! are 7 days and days are 24 hours.

use std::fmt;

/// Parsed components; fractional seconds are folded into `milliseconds`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Duration {
    pub years: i64,
    pub months: i64,
    pub weeks: i64,
    pub days: i64,
    pub hours: i64,
    pub minutes: i64,
    pub milliseconds: i64,
}

/// Invalid duration text, inexact length, overflow or negative input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DurationError(pub String);

impl fmt::Display for DurationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DurationError {}

fn err<T>(m: &str) -> Result<T, DurationError> {
    Err(DurationError(m.into()))
}

fn digits(b: &[u8], i: &mut usize) -> usize {
    let start = *i;
    while *i < b.len() && b[*i].is_ascii_digit() {
        *i += 1;
    }
    *i - start
}

/// Parses `P(nY)?(nM)?(nW)?(nD)?(T(nH)?(nM)?(n(.f{1,3})?S)?)?`, uppercase only,
/// with at least one component and at least one time component after `T`.
pub fn parse_duration(s: &str) -> Result<Duration, DurationError> {
    let b = s.as_bytes();
    if b.first() != Some(&b'P') {
        return err("duration must start with P");
    }
    let mut v = [0i64; 7];
    let (mut i, mut in_time, mut next, mut count, mut time_count) = (1usize, false, 0usize, 0, 0);
    while i < b.len() {
        if b[i] == b'T' {
            if in_time {
                return err("duplicate T");
            }
            in_time = true;
            next = 4;
            i += 1;
            continue;
        }
        let start = i;
        if digits(b, &mut i) == 0 {
            return err("expected digits");
        }
        let n: i64 = s[start..i].parse().map_err(|_| DurationError("component out of range".into()))?;
        let mut frac: Option<&str> = None;
        if i < b.len() && b[i] == b'.' {
            i += 1;
            let fs = i;
            if !(1..=3).contains(&digits(b, &mut i)) {
                return err("seconds fraction needs 1 to 3 digits");
            }
            frac = Some(&s[fs..i]);
        }
        let Some(&designator) = b.get(i) else { return err("missing designator") };
        i += 1;
        let slots: &[(u8, usize)] = if in_time { &[(b'H', 4), (b'M', 5), (b'S', 6)] } else { &[(b'Y', 0), (b'M', 1), (b'W', 2), (b'D', 3)] };
        let Some(&(_, slot)) = slots.iter().find(|(d, slot)| *d == designator && *slot >= next) else {
            return err("unexpected or out-of-order designator");
        };
        if frac.is_some() && slot != 6 {
            return err("only seconds may have a fraction");
        }
        if slot == 6 {
            let ms = n.checked_mul(1000).ok_or_else(|| DurationError("seconds out of range".into()))?;
            let f = frac.map_or(0, |f| f.parse::<i64>().unwrap_or(0) * 10i64.pow(3 - f.len() as u32));
            v[6] = ms.checked_add(f).ok_or_else(|| DurationError("seconds out of range".into()))?;
        } else {
            v[slot] = n;
        }
        next = slot + 1;
        count += 1;
        if in_time {
            time_count += 1;
        }
    }
    if count == 0 || (in_time && time_count == 0) {
        return err("duration needs at least one component");
    }
    Ok(Duration { years: v[0], months: v[1], weeks: v[2], days: v[3], hours: v[4], minutes: v[5], milliseconds: v[6] })
}

/// Exact length in milliseconds; errors when years or months are non-zero.
pub fn duration_milliseconds(d: &Duration) -> Result<i64, DurationError> {
    if d.years != 0 || d.months != 0 {
        return err("years and months have no exact length");
    }
    let overflow = || DurationError("duration overflows i64 milliseconds".into());
    let mut total = d.weeks;
    for (factor, add) in [(7, d.days), (24, d.hours), (60, d.minutes), (60, 0), (1000, d.milliseconds)] {
        total = total.checked_mul(factor).and_then(|t| t.checked_add(add)).ok_or_else(overflow)?;
    }
    Ok(total)
}

/// Formats non-negative milliseconds with days, hours, minutes and seconds
/// (up to 3 fractional digits); zero is `PT0S`.
pub fn format_duration(ms: i64) -> Result<String, DurationError> {
    if ms < 0 {
        return err("milliseconds must be >= 0");
    }
    let (d, r) = (ms / 86_400_000, ms % 86_400_000);
    let (h, r) = (r / 3_600_000, r % 3_600_000);
    let (mi, r) = (r / 60_000, r % 60_000);
    let (s, f) = (r / 1000, r % 1000);
    let mut out = String::from("P");
    if d > 0 {
        out += &format!("{d}D");
    }
    let mut t = String::new();
    if h > 0 {
        t += &format!("{h}H");
    }
    if mi > 0 {
        t += &format!("{mi}M");
    }
    if s > 0 || f > 0 {
        t += &s.to_string();
        if f > 0 {
            t += &format!(".{}", format!("{f:03}").trim_end_matches('0'));
        }
        t.push('S');
    }
    if !t.is_empty() {
        out += &format!("T{t}");
    }
    Ok(if out == "P" { "PT0S".into() } else { out })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dur(years: i64, months: i64, weeks: i64, days: i64, hours: i64, minutes: i64, milliseconds: i64) -> Duration {
        Duration { years, months, weeks, days, hours, minutes, milliseconds }
    }

    #[test]
    fn parse() {
        for (s, want) in [
            ("P1Y2M3DT4H5M6S", dur(1, 2, 0, 3, 4, 5, 6000)),
            ("PT1H30M", dur(0, 0, 0, 0, 1, 30, 0)),
            ("P2W", dur(0, 0, 2, 0, 0, 0, 0)),
            ("PT0.5S", dur(0, 0, 0, 0, 0, 0, 500)),
            ("PT36H", dur(0, 0, 0, 0, 36, 0, 0)),
            ("P0D", dur(0, 0, 0, 0, 0, 0, 0)),
            ("PT1.250S", dur(0, 0, 0, 0, 0, 0, 1250)),
        ] {
            assert_eq!(parse_duration(s), Ok(want), "{s}");
        }
        for s in ["P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", "", "P1D1D", "P1DT1H1H", "PT1S1M", "P99999999999999999999D"] {
            assert!(parse_duration(s).is_err(), "{s}");
        }
    }

    #[test]
    fn milliseconds() {
        for (s, want) in [("PT1H30M", 5400000), ("P2W", 1209600000), ("P1DT0.5S", 86400500), ("PT36H", 129600000)] {
            assert_eq!(duration_milliseconds(&parse_duration(s).unwrap()), Ok(want), "{s}");
        }
        for s in ["P1Y", "P1M"] {
            assert!(duration_milliseconds(&parse_duration(s).unwrap()).is_err(), "{s}");
        }
        assert!(duration_milliseconds(&dur(0, 0, 1 << 50, 0, 0, 0, 0)).is_err());
    }

    #[test]
    fn format() {
        for (ms, want) in [(0, "PT0S"), (5400000, "PT1H30M"), (90061001, "P1DT1H1M1.001S"), (500, "PT0.5S"), (129600000, "P1DT12H"), (1209600000, "P14D")] {
            assert_eq!(format_duration(ms).unwrap(), want);
        }
        assert!(format_duration(-1).is_err());
    }
}
