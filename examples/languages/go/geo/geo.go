// SPDX-License-Identifier: Apache-2.0

// Package geo provides great-circle distance, geohash encoding/decoding and a
// radius bounding box on a spherical Earth.
package geo

import (
	"errors"
	"math"
	"strings"
)

// EarthRadiusM is the mean Earth radius in meters.
const EarthRadiusM = 6371008.8

// GeohashAlphabet is the standard geohash base32 alphabet.
const GeohashAlphabet = "0123456789bcdefghjkmnpqrstuvwxyz"

// Cell is a decoded geohash: center and half the cell size, in degrees.
type Cell struct{ Lat, Lon, LatErr, LonErr float64 }

// Box is a latitude/longitude bounding box in degrees.
type Box struct{ MinLat, MinLon, MaxLat, MaxLon float64 }

func check(lat, lon float64) error {
	if math.IsNaN(lat) || lat < -90 || lat > 90 {
		return errors.New("geo: latitude must be in [-90, 90]")
	}
	if math.IsNaN(lon) || lon < -180 || lon > 180 {
		return errors.New("geo: longitude must be in [-180, 180]")
	}
	return nil
}

func rad(d float64) float64 { return d * math.Pi / 180 }
func deg(r float64) float64 { return r * 180 / math.Pi }

// HaversineMeters returns the great-circle distance between two points.
func HaversineMeters(lat1, lon1, lat2, lon2 float64) (float64, error) {
	if err := check(lat1, lon1); err != nil {
		return 0, err
	}
	if err := check(lat2, lon2); err != nil {
		return 0, err
	}
	p1, p2 := rad(lat1), rad(lat2)
	dp, dl := p2-p1, rad(lon2-lon1)
	h := math.Pow(math.Sin(dp/2), 2) + math.Cos(p1)*math.Cos(p2)*math.Pow(math.Sin(dl/2), 2)
	return 2 * EarthRadiusM * math.Asin(math.Min(1, math.Sqrt(h))), nil
}

// GeohashEncode returns the standard geohash (longitude bit first; values at
// or above the midpoint take the upper half) with precision 1..12.
func GeohashEncode(lat, lon float64, precision int) (string, error) {
	if err := check(lat, lon); err != nil {
		return "", err
	}
	if precision < 1 || precision > 12 {
		return "", errors.New("geo: precision must be from 1 to 12")
	}
	ranges := [2][2]float64{{-180, 180}, {-90, 90}}
	values := [2]float64{lon, lat}
	out := make([]byte, 0, precision)
	bits, char, axis := 0, 0, 0
	for len(out) < precision {
		mid := (ranges[axis][0] + ranges[axis][1]) / 2
		if values[axis] >= mid {
			char, ranges[axis][0] = char*2+1, mid
		} else {
			char, ranges[axis][1] = char*2, mid
		}
		axis, bits = 1-axis, bits+1
		if bits == 5 {
			out = append(out, GeohashAlphabet[char])
			bits, char = 0, 0
		}
	}
	return string(out), nil
}

// GeohashDecode returns the cell center and half the cell size.
func GeohashDecode(hash string) (Cell, error) {
	if len(hash) < 1 || len(hash) > 12 {
		return Cell{}, errors.New("geo: geohash must be 1 to 12 characters")
	}
	ranges := [2][2]float64{{-180, 180}, {-90, 90}}
	axis := 0
	for _, c := range []byte(strings.ToLower(hash)) {
		index := strings.IndexByte(GeohashAlphabet, c)
		if index < 0 {
			return Cell{}, errors.New("geo: invalid geohash character")
		}
		for shift := 4; shift >= 0; shift-- {
			mid := (ranges[axis][0] + ranges[axis][1]) / 2
			if index>>shift&1 == 1 {
				ranges[axis][0] = mid
			} else {
				ranges[axis][1] = mid
			}
			axis = 1 - axis
		}
	}
	lon, lat := ranges[0], ranges[1]
	return Cell{(lat[0] + lat[1]) / 2, (lon[0] + lon[1]) / 2, (lat[1] - lat[0]) / 2, (lon[1] - lon[0]) / 2}, nil
}

// BoundingBox returns a box containing every point within radiusMeters,
// clamped to valid coordinates. The longitude half-width is the circle's
// widest longitude extent, asin(sin(r)/cos(lat)) for angular radius r, and
// becomes the full range when the circle reaches a pole (sin(r) >= cos(lat))
// or when the box would cross the antimeridian, so points on the far side of
// +-180 are never excluded.
func BoundingBox(lat, lon, radiusMeters float64) (Box, error) {
	if err := check(lat, lon); err != nil {
		return Box{}, err
	}
	if math.IsNaN(radiusMeters) || radiusMeters < 0 || radiusMeters >= math.Pi*EarthRadiusM {
		return Box{}, errors.New("geo: radiusMeters must be >= 0 and less than half the circumference")
	}
	angular := radiusMeters / EarthRadiusM
	dLat := deg(angular)
	box := Box{lat - dLat, -180, lat + dLat, 180}
	ratio := 2.0
	if math.Abs(lat) < 90 {
		ratio = math.Sin(angular) / math.Cos(rad(lat))
	}
	if box.MinLat > -90 && box.MaxLat < 90 && ratio < 1 {
		dLon := deg(math.Asin(ratio))
		if lon-dLon >= -180 && lon+dLon <= 180 {
			box.MinLon, box.MaxLon = lon-dLon, lon+dLon
		}
	}
	box.MinLat, box.MaxLat = math.Max(-90, box.MinLat), math.Min(90, box.MaxLat)
	return box, nil
}
