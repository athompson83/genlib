// SPDX-License-Identifier: Apache-2.0

//! Google encoded polyline algorithm (precision 5 for Google Maps, 6 for
//! OSRM/Valhalla-style APIs). Points are `(lat, lon)` in degrees.

use std::fmt;

pub const DEFAULT_PRECISION: u32 = 5;

/// Invalid point, precision or encoded text, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PolylineError(pub String);

impl fmt::Display for PolylineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for PolylineError {}

fn err<T>(m: &str) -> Result<T, PolylineError> {
    Err(PolylineError(m.into()))
}

fn factor(precision: u32) -> Result<f64, PolylineError> {
    if precision > 10 {
        return err("precision must be in 0..=10");
    }
    Ok(10f64.powi(precision as i32))
}

fn scale(v: f64, f: f64) -> Result<i64, PolylineError> {
    let s = v * f;
    if !s.is_finite() || s.abs() > 9_007_199_254_740_992.0 {
        return err("coordinate is not finite or too large");
    }
    let r = (s.abs() + 0.5).floor();
    Ok(if s < 0.0 { -r } else { r } as i64)
}

fn write_value(out: &mut String, d: i64) {
    let mut v = (if d < 0 { !(d << 1) } else { d << 1 }) as u64;
    while v >= 0x20 {
        out.push(char::from(((0x20 | (v & 0x1f)) + 63) as u8));
        v >>= 5;
    }
    out.push(char::from((v + 63) as u8));
}

/// Encodes `(lat, lon)` points at `precision` decimal digits.
pub fn encode_polyline(points: &[(f64, f64)], precision: u32) -> Result<String, PolylineError> {
    let f = factor(precision)?;
    let mut out = String::new();
    let (mut plat, mut plon) = (0i64, 0i64);
    for &(lat, lon) in points {
        if !(-90.0..=90.0).contains(&lat) || !(-180.0..=180.0).contains(&lon) {
            return err("latitude must be in [-90, 90] and longitude in [-180, 180]");
        }
        let (ilat, ilon) = (scale(lat, f)?, scale(lon, f)?);
        write_value(&mut out, ilat - plat);
        write_value(&mut out, ilon - plon);
        (plat, plon) = (ilat, ilon);
    }
    Ok(out)
}

fn read_value(b: &[u8], i: &mut usize) -> Result<i64, PolylineError> {
    let mut result: u64 = 0;
    let mut shift = 0u32;
    loop {
        let Some(&c) = b.get(*i) else { return err("truncated input") };
        if !(63..=126).contains(&c) {
            return err("character outside 63..126");
        }
        if shift > 60 {
            return err("value too long");
        }
        let chunk = u64::from(c - 63);
        result |= (chunk & 0x1f) << shift;
        shift += 5;
        *i += 1;
        if chunk < 0x20 {
            break;
        }
    }
    let v = (result >> 1) as i64;
    Ok(if result & 1 == 1 { !v } else { v })
}

/// Decodes an encoded polyline at `precision` decimal digits.
pub fn decode_polyline(text: &str, precision: u32) -> Result<Vec<(f64, f64)>, PolylineError> {
    let f = factor(precision)?;
    let b = text.as_bytes();
    let (mut i, mut lat, mut lon) = (0usize, 0i64, 0i64);
    let mut points = Vec::new();
    while i < b.len() {
        let dlat = read_value(b, &mut i)?;
        let dlon = read_value(b, &mut i)?;
        lat = lat.checked_add(dlat).ok_or_else(|| PolylineError("value overflow".into()))?;
        lon = lon.checked_add(dlon).ok_or_else(|| PolylineError("value overflow".into()))?;
        points.push((lat as f64 / f, lon as f64 / f));
    }
    Ok(points)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vectors_and_round_trip() {
        type Case<'a> = (&'a [(f64, f64)], u32, &'a str);
        let cases: [Case; 3] = [
            (&[(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)], 5, "_p~iF~ps|U_ulLnnqC_mqNvxq`@"),
            (&[(47.6062, -122.3321), (47.6205, -122.3493)], 6, "ozsxyAf{pihFw|Z~q`@"),
            (&[], 5, ""),
        ];
        for (points, precision, encoded) in cases {
            assert_eq!(encode_polyline(points, precision).unwrap(), encoded);
            let back = decode_polyline(encoded, precision).unwrap();
            assert_eq!(back.len(), points.len());
            let tol = 0.5 * 10f64.powi(-(precision as i32));
            for (a, b) in back.iter().zip(points) {
                assert!((a.0 - b.0).abs() <= tol && (a.1 - b.1).abs() <= tol, "{a:?} vs {b:?}");
            }
        }
    }

    #[test]
    fn rejects() {
        for s in ["_p~iF~ps|U_", "_p~iF", "_p~iF~ps|U!!", "abc\u{7f}", "é"] {
            assert!(decode_polyline(s, 5).is_err(), "{s}");
        }
        assert!(encode_polyline(&[(f64::NAN, 0.0)], 5).is_err());
        assert!(encode_polyline(&[(91.0, 0.0)], 5).is_err());
        assert!(encode_polyline(&[], 11).is_err());
    }
}
