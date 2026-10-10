// SPDX-License-Identifier: Apache-2.0

// Package geometry provides planar polygon and line helpers on [x, y] points
// (x = longitude, y = latitude): point-in-polygon, signed area, centroid,
// Douglas-Peucker simplification and a spherical ring area in square meters.
// Planar results on raw degrees are approximations; project first for
// accurate distances.
package geometry

import (
	"errors"
	"math"
)

// Point is [x, y], i.e. [lon, lat] for geographic data.
type Point [2]float64

// EarthRadiusM is the WGS 84 semi-major axis used by RingAreaSquareMeters.
const EarthRadiusM = 6378137.0

func finite(p Point) bool {
	for _, v := range p {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	return true
}

// normalize drops a closing duplicate and checks that at least 3 finite
// points remain.
func normalize(ring []Point) ([]Point, error) {
	if len(ring) > 1 && ring[0] == ring[len(ring)-1] {
		ring = ring[:len(ring)-1]
	}
	if len(ring) < 3 {
		return nil, errors.New("geometry: ring needs at least 3 distinct points")
	}
	for _, p := range ring {
		if !finite(p) {
			return nil, errors.New("geometry: coordinates must be finite")
		}
	}
	return ring, nil
}

func onSegment(p, a, b Point) bool {
	cross := (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0])
	return cross == 0 &&
		math.Min(a[0], b[0]) <= p[0] && p[0] <= math.Max(a[0], b[0]) &&
		math.Min(a[1], b[1]) <= p[1] && p[1] <= math.Max(a[1], b[1])
}

// PointInPolygon reports whether point lies inside ring (implicitly closed).
// Points on an edge or vertex count as inside; otherwise even-odd ray casting.
func PointInPolygon(point Point, ring []Point) (bool, error) {
	r, err := normalize(ring)
	if err != nil {
		return false, err
	}
	if !finite(point) {
		return false, errors.New("geometry: coordinates must be finite")
	}
	x, y := point[0], point[1]
	inside := false
	for i := range r {
		a, b := r[i], r[(i+1)%len(r)]
		if onSegment(point, a, b) {
			return true, nil
		}
		if (a[1] > y) != (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0] {
			inside = !inside
		}
	}
	return inside, nil
}

// SignedArea returns the shoelace area; counter-clockwise rings are positive.
func SignedArea(ring []Point) (float64, error) {
	r, err := normalize(ring)
	if err != nil {
		return 0, err
	}
	return shoelace(r), nil
}

func shoelace(r []Point) float64 {
	sum := 0.0
	for i := range r {
		a, b := r[i], r[(i+1)%len(r)]
		sum += a[0]*b[1] - b[0]*a[1]
	}
	return sum / 2
}

// Centroid returns the area-weighted centroid; zero-area rings are an error.
func Centroid(ring []Point) (Point, error) {
	r, err := normalize(ring)
	if err != nil {
		return Point{}, err
	}
	a := shoelace(r)
	if a == 0 {
		return Point{}, errors.New("geometry: centroid of a zero-area ring is undefined")
	}
	var cx, cy float64
	for i := range r {
		p, q := r[i], r[(i+1)%len(r)]
		c := p[0]*q[1] - q[0]*p[1]
		cx += (p[0] + q[0]) * c
		cy += (p[1] + q[1]) * c
	}
	return Point{cx / (6 * a), cy / (6 * a)}, nil
}

func segmentDistance(p, a, b Point) float64 {
	dx, dy := b[0]-a[0], b[1]-a[1]
	if dx == 0 && dy == 0 {
		return math.Hypot(p[0]-a[0], p[1]-a[1])
	}
	t := ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / (dx*dx + dy*dy)
	t = math.Max(0, math.Min(1, t))
	return math.Hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy))
}

func douglasPeucker(pts []Point, tol float64) []Point {
	if len(pts) <= 2 {
		return append([]Point(nil), pts...)
	}
	best, idx := -1.0, 0
	for i := 1; i < len(pts)-1; i++ {
		if d := segmentDistance(pts[i], pts[0], pts[len(pts)-1]); d > best {
			best, idx = d, i
		}
	}
	if best <= tol {
		return []Point{pts[0], pts[len(pts)-1]}
	}
	left := douglasPeucker(pts[:idx+1], tol)
	return append(left[:len(left)-1], douglasPeucker(pts[idx:], tol)...)
}

// Simplify applies Douglas-Peucker with the given tolerance (>= 0). Lines with
// fewer than 3 points are returned unchanged.
func Simplify(points []Point, tolerance float64) ([]Point, error) {
	if math.IsNaN(tolerance) || tolerance < 0 {
		return nil, errors.New("geometry: tolerance must be >= 0")
	}
	for _, p := range points {
		if !finite(p) {
			return nil, errors.New("geometry: coordinates must be finite")
		}
	}
	return douglasPeucker(points, tolerance), nil
}

// RingAreaSquareMeters approximates the area of a lon/lat ring on a sphere of
// radius EarthRadiusM (the formula used by Turf and Mapbox).
func RingAreaSquareMeters(ring []Point) (float64, error) {
	r, err := normalize(ring)
	if err != nil {
		return 0, err
	}
	rad := math.Pi / 180
	total := 0.0
	for i := range r {
		a, b := r[i], r[(i+1)%len(r)]
		total += (b[0] - a[0]) * rad * (2 + math.Sin(a[1]*rad) + math.Sin(b[1]*rad))
	}
	return math.Abs(total * EarthRadiusM * EarthRadiusM / 2), nil
}
