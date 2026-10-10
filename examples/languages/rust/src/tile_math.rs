// SPDX-License-Identifier: Apache-2.0

//! Web Mercator (EPSG:3857) and slippy-map tile math: lon/lat to tile, tile
//! bounds, Bing quadkeys and lon/lat to Mercator meters.

use std::f64::consts::PI;
use std::fmt;

pub const MAX_LATITUDE: f64 = 85.051_128_779_806_59;
pub const EARTH_RADIUS_M: f64 = 6_378_137.0;
pub const MAX_ZOOM: u32 = 24;

/// Invalid coordinate, zoom, tile or quadkey, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TileError(pub String);

impl fmt::Display for TileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TileError {}

fn err<T>(m: &str) -> Result<T, TileError> {
    Err(TileError(m.into()))
}

fn check_zoom(zoom: u32) -> Result<(), TileError> {
    if zoom > MAX_ZOOM {
        return err("zoom must be in 0..=24");
    }
    Ok(())
}

fn check_tile(x: u32, y: u32, zoom: u32) -> Result<(), TileError> {
    check_zoom(zoom)?;
    let max = (1u32 << zoom) - 1;
    if x > max || y > max {
        return err("tile x and y must be in [0, 2^zoom - 1]");
    }
    Ok(())
}

/// Tile `(x, y)` containing lon/lat at `zoom`; latitude is clamped to the
/// Mercator limit.
pub fn lon_lat_to_tile(lon: f64, lat: f64, zoom: u32) -> Result<(u32, u32), TileError> {
    check_zoom(zoom)?;
    if !(-180.0..=180.0).contains(&lon) || !(-90.0..=90.0).contains(&lat) {
        return err("longitude must be in [-180, 180] and latitude in [-90, 90]");
    }
    let n = f64::from(1u32 << zoom);
    let r = lat.clamp(-MAX_LATITUDE, MAX_LATITUDE).to_radians();
    let x = ((lon + 180.0) / 360.0 * n).floor();
    let y = ((1.0 - (r.tan() + 1.0 / r.cos()).ln() / PI) / 2.0 * n).floor();
    Ok((x.clamp(0.0, n - 1.0) as u32, y.clamp(0.0, n - 1.0) as u32))
}

/// `[west, south, east, north]` in degrees.
pub fn tile_bounds(x: u32, y: u32, zoom: u32) -> Result<[f64; 4], TileError> {
    check_tile(x, y, zoom)?;
    let n = f64::from(1u32 << zoom);
    let lon = |v: u32| f64::from(v) / n * 360.0 - 180.0;
    let lat = |v: u32| (PI * (1.0 - 2.0 * f64::from(v) / n)).sinh().atan().to_degrees();
    Ok([lon(x), lat(y + 1), lon(x + 1), lat(y)])
}

/// Bing Maps quadkey for a tile.
pub fn tile_to_quadkey(x: u32, y: u32, zoom: u32) -> Result<String, TileError> {
    check_tile(x, y, zoom)?;
    Ok((1..=zoom)
        .rev()
        .map(|i| {
            let m = 1u32 << (i - 1);
            char::from(b'0' + u8::from(x & m != 0) + 2 * u8::from(y & m != 0))
        })
        .collect())
}

/// Parses a quadkey into `(x, y, zoom)`; the empty key is the zoom 0 tile.
pub fn quadkey_to_tile(key: &str) -> Result<(u32, u32, u32), TileError> {
    if key.len() > MAX_ZOOM as usize {
        return err("quadkey longer than 24 digits");
    }
    let (mut x, mut y) = (0u32, 0u32);
    for b in key.bytes() {
        if !(b'0'..=b'3').contains(&b) {
            return err("quadkey digits must be 0-3");
        }
        let d = u32::from(b - b'0');
        x = x << 1 | (d & 1);
        y = y << 1 | (d >> 1);
    }
    Ok((x, y, key.len() as u32))
}

/// EPSG:3857 `[x, y]` meters.
pub fn lon_lat_to_mercator(lon: f64, lat: f64) -> Result<[f64; 2], TileError> {
    if !(-180.0..=180.0).contains(&lon) || lat.is_nan() || lat.abs() > MAX_LATITUDE + 1e-9 {
        return err("longitude must be in [-180, 180] and |latitude| <= 85.05112877980659");
    }
    Ok([lon.to_radians() * EARTH_RADIUS_M, (PI / 4.0 + lat.to_radians() / 2.0).tan().ln() * EARTH_RADIUS_M])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiles() {
        for (lon, lat, z, x, y) in [
            (-122.4194, 37.7749, 12, 655, 1583),
            (0.0, 0.0, 0, 0, 0),
            (2.3522, 48.8566, 15, 16598, 11273),
            (179.9999, -89.9, 3, 7, 7),
            (-180.0, 85.1, 2, 0, 0),
        ] {
            assert_eq!(lon_lat_to_tile(lon, lat, z), Ok((x, y)), "{lon},{lat},{z}");
        }
        assert!(lon_lat_to_tile(0.0, 0.0, 25).is_err());
        assert!(lon_lat_to_tile(181.0, 0.0, 1).is_err());
        assert!(lon_lat_to_tile(f64::NAN, 0.0, 1).is_err());
        assert!(lon_lat_to_tile(0.0, f64::INFINITY, 1).is_err());
    }

    #[test]
    fn bounds() {
        for (x, y, z, want) in [
            (0, 0, 0, [-180.0, -85.0511287798066, 180.0, 85.0511287798066]),
            (655, 1583, 12, [-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046]),
            (1, 1, 1, [0.0, -85.0511287798066, 180.0, 0.0]),
        ] {
            let got = tile_bounds(x, y, z).unwrap();
            for (g, w) in got.iter().zip(want) {
                assert!((g - w).abs() <= 1e-9, "{got:?} vs {want:?}");
            }
        }
        assert!(tile_bounds(2, 0, 1).is_err());
        assert!(tile_bounds(0, 0, 25).is_err());
    }

    #[test]
    fn quadkeys() {
        for (x, y, z, key) in [(3, 5, 3, "213"), (655, 1583, 12, "023010203333"), (0, 0, 1, "0"), (0, 0, 0, "")] {
            assert_eq!(tile_to_quadkey(x, y, z).unwrap(), key);
            assert_eq!(quadkey_to_tile(key), Ok((x, y, z)));
        }
        assert!(quadkey_to_tile("0124").is_err());
    }

    #[test]
    fn mercator() {
        for (lon, lat, want) in [
            (0.0, 0.0, [0.0, -7.081154551613622e-10]),
            (-122.4194, 37.7749, [-13627665.271218073, 4547675.354340557]),
            (180.0, 85.05112877980659, [20037508.342789244, 20037508.342789244]),
        ] {
            let got = lon_lat_to_mercator(lon, lat).unwrap();
            assert!((got[0] - want[0]).abs() <= 1e-6 && (got[1] - want[1]).abs() <= 1e-6, "{got:?}");
        }
        assert!(lon_lat_to_mercator(0.0, 85.06).is_err());
    }
}
