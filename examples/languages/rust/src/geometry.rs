// SPDX-License-Identifier: Apache-2.0

//! Planar polygon and line helpers on `[x, y]` points (x = longitude,
//! y = latitude): point-in-polygon, signed area, centroid, Douglas-Peucker
//! simplification and a spherical ring area in square meters. Planar results
//! on raw degrees are approximations; project first for accurate distances.

use std::fmt;

pub type Point = [f64; 2];

pub const EARTH_RADIUS_M: f64 = 6_378_137.0;

/// Invalid ring, coordinate or tolerance, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GeometryError(pub String);

impl fmt::Display for GeometryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for GeometryError {}

fn err<T>(m: &str) -> Result<T, GeometryError> {
    Err(GeometryError(m.into()))
}

fn finite(p: &Point) -> bool {
    p[0].is_finite() && p[1].is_finite()
}

/// Drops a closing duplicate and requires at least 3 finite points.
fn normalize(ring: &[Point]) -> Result<&[Point], GeometryError> {
    let r = if ring.len() > 1 && ring[0] == ring[ring.len() - 1] { &ring[..ring.len() - 1] } else { ring };
    if r.len() < 3 {
        return err("ring needs at least 3 distinct points");
    }
    if !r.iter().all(finite) {
        return err("coordinates must be finite");
    }
    Ok(r)
}

fn edges(r: &[Point]) -> impl Iterator<Item = (Point, Point)> + '_ {
    (0..r.len()).map(move |i| (r[i], r[(i + 1) % r.len()]))
}

fn on_segment(p: Point, a: Point, b: Point) -> bool {
    let cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    cross == 0.0
        && a[0].min(b[0]) <= p[0]
        && p[0] <= a[0].max(b[0])
        && a[1].min(b[1]) <= p[1]
        && p[1] <= a[1].max(b[1])
}

/// Whether `point` is inside `ring` (implicitly closed). Edge and vertex
/// points count as inside; otherwise even-odd ray casting.
pub fn point_in_polygon(point: Point, ring: &[Point]) -> Result<bool, GeometryError> {
    let r = normalize(ring)?;
    if !finite(&point) {
        return err("coordinates must be finite");
    }
    let [x, y] = point;
    let mut inside = false;
    for (a, b) in edges(r) {
        if on_segment(point, a, b) {
            return Ok(true);
        }
        if (a[1] > y) != (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0] {
            inside = !inside;
        }
    }
    Ok(inside)
}

fn shoelace(r: &[Point]) -> f64 {
    edges(r).map(|(a, b)| a[0] * b[1] - b[0] * a[1]).sum::<f64>() / 2.0
}

/// Shoelace area; counter-clockwise rings are positive.
pub fn signed_area(ring: &[Point]) -> Result<f64, GeometryError> {
    Ok(shoelace(normalize(ring)?))
}

/// Area-weighted centroid; zero-area rings are an error.
pub fn centroid(ring: &[Point]) -> Result<Point, GeometryError> {
    let r = normalize(ring)?;
    let a = shoelace(r);
    if a == 0.0 {
        return err("centroid of a zero-area ring is undefined");
    }
    let (mut cx, mut cy) = (0.0, 0.0);
    for (p, q) in edges(r) {
        let c = p[0] * q[1] - q[0] * p[1];
        cx += (p[0] + q[0]) * c;
        cy += (p[1] + q[1]) * c;
    }
    Ok([cx / (6.0 * a), cy / (6.0 * a)])
}

fn segment_distance(p: Point, a: Point, b: Point) -> f64 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    if dx == 0.0 && dy == 0.0 {
        return (p[0] - a[0]).hypot(p[1] - a[1]);
    }
    let t = (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0);
    (p[0] - (a[0] + t * dx)).hypot(p[1] - (a[1] + t * dy))
}

fn douglas_peucker(pts: &[Point], tol: f64) -> Vec<Point> {
    if pts.len() <= 2 {
        return pts.to_vec();
    }
    let last = pts[pts.len() - 1];
    let (mut best, mut idx) = (-1.0, 0);
    for (i, p) in pts.iter().enumerate().take(pts.len() - 1).skip(1) {
        let d = segment_distance(*p, pts[0], last);
        if d > best {
            (best, idx) = (d, i);
        }
    }
    if best <= tol {
        return vec![pts[0], last];
    }
    let mut left = douglas_peucker(&pts[..=idx], tol);
    left.pop();
    left.extend(douglas_peucker(&pts[idx..], tol));
    left
}

/// Douglas-Peucker simplification (tolerance >= 0); lines with fewer than 3
/// points are returned unchanged.
pub fn simplify(points: &[Point], tolerance: f64) -> Result<Vec<Point>, GeometryError> {
    if tolerance.is_nan() || tolerance < 0.0 {
        return err("tolerance must be >= 0");
    }
    if !points.iter().all(finite) {
        return err("coordinates must be finite");
    }
    Ok(douglas_peucker(points, tolerance))
}

/// Spherical approximation of a lon/lat ring's area (the Turf/Mapbox formula).
pub fn ring_area_square_meters(ring: &[Point]) -> Result<f64, GeometryError> {
    let r = normalize(ring)?;
    let total: f64 = edges(r)
        .map(|(a, b)| (b[0] - a[0]).to_radians() * (2.0 + a[1].to_radians().sin() + b[1].to_radians().sin()))
        .sum();
    Ok((total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2.0).abs())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SQUARE: [Point; 4] = [[0.0, 0.0], [4.0, 0.0], [4.0, 4.0], [0.0, 4.0]];
    const CONCAVE: [Point; 5] = [[0.0, 0.0], [6.0, 0.0], [6.0, 6.0], [3.0, 3.0], [0.0, 6.0]];
    const LINE: [Point; 10] = [[0.0, 0.0], [1.0, 0.1], [2.0, -0.1], [3.0, 5.0], [4.0, 6.0], [5.0, 7.0], [6.0, 8.1], [7.0, 9.0], [8.0, 9.0], [9.0, 9.0]];

    #[test]
    fn pip() {
        for (ring, p, want) in [
            (&SQUARE[..], [2.0, 2.0], true),
            (&SQUARE[..], [5.0, 2.0], false),
            (&SQUARE[..], [4.0, 2.0], true),
            (&SQUARE[..], [0.0, 0.0], true),
            (&SQUARE[..], [2.0, 4.000001], false),
            (&CONCAVE[..], [3.0, 4.0], false),
            (&CONCAVE[..], [3.0, 2.0], true),
            (&CONCAVE[..], [1.0, 5.0], true),
            (&CONCAVE[..], [3.0, 3.0], true),
        ] {
            assert_eq!(point_in_polygon(p, ring), Ok(want), "{p:?}");
        }
        let closed = [SQUARE[0], SQUARE[1], SQUARE[2], SQUARE[3], SQUARE[0]];
        assert_eq!(point_in_polygon([2.0, 2.0], &closed), Ok(true));
        assert!(point_in_polygon([0.0, 0.0], &SQUARE[..2]).is_err());
    }

    #[test]
    fn area_and_centroid() {
        let reversed = [[0.0, 4.0], [4.0, 4.0], [4.0, 0.0], [0.0, 0.0]];
        assert_eq!(signed_area(&SQUARE), Ok(16.0));
        assert_eq!(signed_area(&reversed), Ok(-16.0));
        assert_eq!(signed_area(&CONCAVE), Ok(27.0));
        for (ring, want) in [(&SQUARE[..], [2.0, 2.0]), (&CONCAVE[..], [3.0, 2.3333333333333335])] {
            let c = centroid(ring).unwrap();
            assert!((c[0] - want[0]).abs() <= 1e-9 && (c[1] - want[1]).abs() <= 1e-9, "{c:?}");
        }
        assert!(centroid(&[[0.0, 0.0], [1.0, 1.0], [2.0, 2.0]]).is_err());
    }

    #[test]
    fn simplify_vectors() {
        assert_eq!(simplify(&LINE, 1.0).unwrap(), vec![[0.0, 0.0], [2.0, -0.1], [3.0, 5.0], [7.0, 9.0], [9.0, 9.0]]);
        assert_eq!(simplify(&LINE, 0.05).unwrap(), vec![[0.0, 0.0], [1.0, 0.1], [2.0, -0.1], [3.0, 5.0], [6.0, 8.1], [7.0, 9.0], [9.0, 9.0]]);
        assert_eq!(simplify(&[[0.0, 0.0], [5.0, 5.0]], 1.0).unwrap(), vec![[0.0, 0.0], [5.0, 5.0]]);
        assert!(simplify(&LINE, -1.0).is_err());
    }

    #[test]
    fn ring_area() {
        for (ring, want) in [
            ([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]], 12391399902.070992),
            ([[-0.13, 51.5], [-0.12, 51.5], [-0.12, 51.51], [-0.13, 51.51]], 771337.3090775362),
        ] {
            let got = ring_area_square_meters(&ring).unwrap();
            assert!(((got - want) / want).abs() <= 1e-9, "{got}");
        }
    }
}
