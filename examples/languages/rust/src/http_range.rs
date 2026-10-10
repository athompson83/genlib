// SPDX-License-Identifier: Apache-2.0

//! RFC 9110 `Range` header parsing for byte ranges and `Content-Range`
//! formatting.

/// Largest number of range specs accepted in one header.
pub const MAX_SPECS: usize = 100;

/// How the server should answer a range request.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RangeResult {
    /// No or unusable header: serve 200 with the full body.
    None,
    /// Respond 416 with this `Content-Range` value (`bytes */<size>`).
    Unsatisfiable { content_range: String },
    /// Respond 206: inclusive ranges in header order, not merged.
    Ranges(Vec<(u64, u64)>),
}

fn digits(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit())
}

/// Decimal digits saturating at `u64::MAX`.
fn number(s: &str) -> u64 {
    s.parse().unwrap_or(u64::MAX)
}

/// Compares two decimal digit strings of any length.
fn less(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim_start_matches('0'), b.trim_start_matches('0'));
    if a.len() != b.len() {
        a.len() < b.len()
    } else {
        a < b
    }
}

/// Interprets a `Range` header for a body of `size` bytes.
pub fn parse_range(header: Option<&str>, size: u64) -> RangeResult {
    let Some(header) = header else { return RangeResult::None };
    let h = header.trim_start_matches([' ', '\t']);
    let Some((unit, rest)) = h.split_once('=') else { return RangeResult::None };
    if !unit.eq_ignore_ascii_case("bytes") {
        return RangeResult::None;
    }
    let specs: Vec<&str> = rest.split(',').collect();
    if specs.len() > MAX_SPECS {
        return RangeResult::None;
    }
    let mut out = Vec::new();
    for raw in specs {
        let p = raw.trim_matches([' ', '\t']);
        let Some((first, last)) = p.split_once('-') else { return RangeResult::None };
        if first.is_empty() {
            if !digits(last) {
                return RangeResult::None;
            }
            let n = number(last);
            if n == 0 || size == 0 {
                continue;
            }
            out.push((size.saturating_sub(n), size - 1));
            continue;
        }
        if !digits(first) || (!last.is_empty() && !digits(last)) || (!last.is_empty() && less(last, first)) {
            return RangeResult::None;
        }
        let a = number(first);
        if a >= size {
            continue;
        }
        let end = if last.is_empty() { size - 1 } else { number(last).min(size - 1) };
        out.push((a, end));
    }
    if out.is_empty() {
        RangeResult::Unsatisfiable { content_range: format!("bytes */{size}") }
    } else {
        RangeResult::Ranges(out)
    }
}

/// `bytes start-end/size`.
pub fn content_range(start: u64, end: u64, size: u64) -> String {
    format!("bytes {start}-{end}/{size}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unsat(size: u64) -> RangeResult {
        RangeResult::Unsatisfiable { content_range: format!("bytes */{size}") }
    }

    #[test]
    fn vectors() {
        use RangeResult::{None as N, Ranges as R};
        for (header, want) in [
            (Some("bytes=0-499"), R(vec![(0, 499)])),
            (Some("bytes=500-999"), R(vec![(500, 999)])),
            (Some("bytes=-500"), R(vec![(9500, 9999)])),
            (Some("bytes=9500-"), R(vec![(9500, 9999)])),
            (Some("bytes=0-0,-1"), R(vec![(0, 0), (9999, 9999)])),
            (Some("bytes= 0-1 , 5-6"), R(vec![(0, 1), (5, 6)])),
            (Some("BYTES=0-99"), R(vec![(0, 99)])),
            (Some("bytes=9999-20000"), R(vec![(9999, 9999)])),
            (Some("bytes=10000-"), unsat(10000)),
            (Some("bytes=-0"), unsat(10000)),
            (Some("bytes=-20000"), R(vec![(0, 9999)])),
            (Some("bytes=500-400"), N),
            (Some("items=0-1"), N),
            (Some("bytes="), N),
            (Some("bytes=0-1,"), N),
            (Some("bytes=abc"), N),
            (Some("bytes=1-2-3"), N),
            (None, N),
            (Some("bytes=10000-10001,20000-"), unsat(10000)),
        ] {
            assert_eq!(parse_range(header, 10000), want, "{header:?}");
        }
        assert_eq!(parse_range(Some("bytes=0-"), 0), unsat(0));
        assert_eq!(parse_range(Some("bytes=-5"), 0), unsat(0));
        assert_eq!(content_range(0, 499, 10000), "bytes 0-499/10000");
    }

    #[test]
    fn limits() {
        let many = format!("bytes={}", vec!["0-1"; 101].join(","));
        assert_eq!(parse_range(Some(&many), 10), RangeResult::None);
        assert_eq!(parse_range(Some("bytes=99999999999999999999-99999999999999999998"), 10), RangeResult::None);
        assert_eq!(parse_range(Some("bytes=0-99999999999999999999"), 10), RangeResult::Ranges(vec![(0, 9)]));
        assert_eq!(parse_range(Some(""), 10), RangeResult::None);
    }
}
