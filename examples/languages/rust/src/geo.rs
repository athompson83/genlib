// SPDX-License-Identifier: Apache-2.0

//! Great-circle distance (haversine, mean Earth radius 6,371,008.8 m),
//! geohash encode/decode and a radius bounding box for coarse SQL prefilters.

use std::fmt;

pub const EARTH_RADIUS_M: f64 = 6_371_008.8;
const BASE32: &[u8; 32] = b"0123456789bcdefghjkmnpqrstuvwxyz";

/// Invalid coordinate, precision or geohash error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeoError(pub String);

impl fmt::Display for GeoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for GeoError {}

fn err<T>(m: impl Into<String>) -> Result<T, GeoError> {
    Err(GeoError(m.into()))
}

fn check(lat: f64, lon: f64) -> Result<(), GeoError> {
    if !(-90.0..=90.0).contains(&lat) {
        return err(format!("latitude must be in [-90, 90]: {lat}"));
    }
    if !(-180.0..=180.0).contains(&lon) {
        return err(format!("longitude must be in [-180, 180]: {lon}"));
    }
    Ok(())
}

/// Great-circle distance in meters.
pub fn haversine_meters(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> Result<f64, GeoError> {
    check(lat1, lon1)?;
    check(lat2, lon2)?;
    let (p1, p2) = (lat1.to_radians(), lat2.to_radians());
    let (dp, dl) = ((lat2 - lat1).to_radians(), (lon2 - lon1).to_radians());
    let h = (dp / 2.0).sin().powi(2) + p1.cos() * p2.cos() * (dl / 2.0).sin().powi(2);
    Ok(2.0 * EARTH_RADIUS_M * h.sqrt().min(1.0).asin())
}

/// Geohash of `precision` (1..=12) characters, longitude bit first.
pub fn geohash_encode(lat: f64, lon: f64, precision: usize) -> Result<String, GeoError> {
    check(lat, lon)?;
    if !(1..=12).contains(&precision) {
        return err("precision must be 1 to 12");
    }
    let (mut lat_r, mut lon_r) = ((-90.0, 90.0), (-180.0, 180.0));
    let mut out = String::with_capacity(precision);
    let (mut bit, mut ch, mut even) = (0, 0usize, true);
    while out.len() < precision {
        let (range, value): (&mut (f64, f64), f64) = if even { (&mut lon_r, lon) } else { (&mut lat_r, lat) };
        let mid = (range.0 + range.1) / 2.0;
        ch <<= 1;
        if value >= mid {
            ch |= 1;
            range.0 = mid;
        } else {
            range.1 = mid;
        }
        even = !even;
        bit += 1;
        if bit == 5 {
            out.push(BASE32[ch] as char);
            bit = 0;
            ch = 0;
        }
    }
    Ok(out)
}

/// A decoded geohash cell: center and half the cell size in each axis.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GeohashCell {
    pub lat: f64,
    pub lon: f64,
    pub lat_err: f64,
    pub lon_err: f64,
}

/// Decodes a geohash (case-insensitive) to its cell center and error.
pub fn geohash_decode(hash: &str) -> Result<GeohashCell, GeoError> {
    if hash.is_empty() || hash.len() > 12 {
        return err("geohash must be 1 to 12 characters");
    }
    let (mut lat_r, mut lon_r) = ((-90.0f64, 90.0f64), (-180.0f64, 180.0f64));
    let mut even = true;
    for c in hash.bytes() {
        let Some(v) = BASE32.iter().position(|&b| b == c.to_ascii_lowercase()) else {
            return err(format!("invalid geohash character {:?}", c as char));
        };
        for shift in (0..5).rev() {
            let range = if even { &mut lon_r } else { &mut lat_r };
            let mid = (range.0 + range.1) / 2.0;
            if (v >> shift) & 1 == 1 {
                range.0 = mid;
            } else {
                range.1 = mid;
            }
            even = !even;
        }
    }
    Ok(GeohashCell {
        lat: (lat_r.0 + lat_r.1) / 2.0,
        lon: (lon_r.0 + lon_r.1) / 2.0,
        lat_err: (lat_r.1 - lat_r.0) / 2.0,
        lon_err: (lon_r.1 - lon_r.0) / 2.0,
    })
}

/// Latitude/longitude bounds enclosing a circle of `radius_meters`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BoundingBox {
    pub min_lat: f64,
    pub min_lon: f64,
    pub max_lat: f64,
    pub max_lon: f64,
}

/// Box around a point: latitude +-radius/R, longitude half-width equal to the
/// circle's widest longitude extent, asin(sin(r)/cos(lat)) for angular radius r,
/// latitude clamped to valid ranges. Near a pole (or when sin(r) >= cos(lat)) and
/// when the box would cross the antimeridian, the longitude range becomes
/// [-180, 180] so far-side points are never excluded. Use as a prefilter, then haversine.
pub fn bounding_box(lat: f64, lon: f64, radius_meters: f64) -> Result<BoundingBox, GeoError> {
    check(lat, lon)?;
    if !radius_meters.is_finite() || radius_meters < 0.0 {
        return err("radiusMeters must be a non-negative finite number");
    }
    let angular = radius_meters / EARTH_RADIUS_M;
    let dlat = angular.to_degrees();
    let (min_lat, max_lat) = (lat - dlat, lat + dlat);
    let s = angular.sin() / lat.to_radians().cos();
    let (min_lon, max_lon) = if min_lat <= -90.0 || max_lat >= 90.0 || !(s.is_finite() && s < 1.0) {
        (-180.0, 180.0)
    } else {
        let dlon = s.asin().to_degrees();
        if lon - dlon < -180.0 || lon + dlon > 180.0 { (-180.0, 180.0) } else { (lon - dlon, lon + dlon) }
    };
    Ok(BoundingBox { min_lat: min_lat.max(-90.0), min_lon, max_lat: max_lat.min(90.0), max_lon })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distance_vectors() {
        assert_eq!(haversine_meters(51.5074, -0.1278, 48.8566, 2.3522).unwrap().round(), 343557.0);
        assert_eq!(haversine_meters(10.0, 10.0, 10.0, 10.0).unwrap().round(), 0.0);
        assert_eq!(haversine_meters(0.0, 0.0, 0.0, 180.0).unwrap().round(), 20015114.0);
        assert!(haversine_meters(91.0, 0.0, 0.0, 0.0).is_err());
        assert!(haversine_meters(0.0, 0.0, 0.0, -180.5).is_err());
        assert!(haversine_meters(f64::NAN, 0.0, 0.0, 0.0).is_err());
    }

    #[test]
    fn geohash_vectors_and_round_trip() {
        for (lat, lon, p, want) in [
            (37.7749, -122.4194, 9, "9q8yyk8yt"),
            (0.0, 0.0, 5, "s0000"),
            (-33.8688, 151.2093, 7, "r3gx2f7"),
        ] {
            assert_eq!(geohash_encode(lat, lon, p).unwrap(), want);
            let cell = geohash_decode(want).unwrap();
            assert!((cell.lat - lat).abs() <= cell.lat_err && (cell.lon - lon).abs() <= cell.lon_err, "{want}");
        }
        assert_eq!(geohash_decode("9Q8YYK8YT").unwrap(), geohash_decode("9q8yyk8yt").unwrap());
        assert!(geohash_encode(0.0, 0.0, 0).is_err());
        assert!(geohash_encode(0.0, 0.0, 13).is_err());
        for bad in ["", "abc", "9q8a", "s000i", "0123456789bcd"] {
            assert!(geohash_decode(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn bounding_box_property() {
        let (lat, lon, r) = (51.5, -0.12, 10000.0);
        let b = bounding_box(lat, lon, r).unwrap();
        for (plat, plon) in [(b.max_lat, lon), (b.min_lat, lon), (lat, b.max_lon), (lat, b.min_lon)] {
            assert!(haversine_meters(lat, lon, plat, plon).unwrap() >= r - 1.0, "{plat},{plon}");
        }
        assert!(b.min_lat < lat && b.max_lat > lat && b.min_lon < lon && b.max_lon > lon);
        let polar = bounding_box(89.99, 10.0, 5000.0).unwrap();
        assert_eq!((polar.min_lon, polar.max_lon, polar.max_lat), (-180.0, 180.0, 90.0));
        assert!(bounding_box(0.0, 0.0, -1.0).is_err());
    }

    // Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
    #[test]
    fn bounding_box_longitude_extent() {
        let b = bounding_box(60.0, 0.0, 0.1 * EARTH_RADIUS_M).unwrap();
        let half = b.max_lon.to_radians();
        let want = (0.1f64.sin() / 60f64.to_radians().cos()).asin();
        assert!((half - want).abs() <= 1e-6 * want, "half-width {half}, want {want}");
        assert!((half - 0.20101).abs() < 1e-5 && (b.min_lon + b.max_lon).abs() < 1e-12, "{b:?}");
    }

    #[test]
    fn bounding_box_antimeridian_spans_all_longitudes() {
        for (c_lon, bearing) in [(179.9f64, 90.0f64), (-179.9, 270.0)] {
            let b = bounding_box(10.0, c_lon, 50_000.0).unwrap();
            assert_eq!((b.min_lon, b.max_lon), (-180.0, 180.0), "center lon {c_lon}: {b:?}");
            let (d, p1, t) = (50_000.0 / EARTH_RADIUS_M, 10f64.to_radians(), bearing.to_radians());
            let p2 = (p1.sin() * d.cos() + p1.cos() * d.sin() * t.cos()).asin();
            let l2 = c_lon.to_radians() + (t.sin() * d.sin() * p1.cos()).atan2(d.cos() - p1.sin() * p2.sin());
            let (lat, lon) = (p2.to_degrees(), (l2.to_degrees() + 540.0).rem_euclid(360.0) - 180.0);
            assert!(lon.abs() > 179.5, "{lon}");
            assert!(lat >= b.min_lat && lat <= b.max_lat && lon >= b.min_lon && lon <= b.max_lon, "{lat},{lon} outside {b:?}");
        }
    }

    #[test]
    fn bounding_box_contains_circle() {
        for c_lat in [0.0f64, 45.0, 60.0, 75.0, -70.0] {
            for radius in [1_000.0, 100_000.0, 1_000_000.0] {
                let b = bounding_box(c_lat, 0.0, radius).unwrap();
                let d = radius / EARTH_RADIUS_M;
                let p1 = c_lat.to_radians();
                for i in 0..360 {
                    let t = (i as f64).to_radians();
                    let p2 = (p1.sin() * d.cos() + p1.cos() * d.sin() * t.cos()).asin();
                    let l2 = (t.sin() * d.sin() * p1.cos()).atan2(d.cos() - p1.sin() * p2.sin());
                    let (lat, lon) = (p2.to_degrees(), l2.to_degrees());
                    assert!(
                        lat >= b.min_lat - 1e-9 && lat <= b.max_lat + 1e-9 && lon >= b.min_lon - 1e-9 && lon <= b.max_lon + 1e-9,
                        "center {c_lat}, radius {radius}, bearing {i}: {lat},{lon} outside {b:?}"
                    );
                }
            }
        }
    }
}
