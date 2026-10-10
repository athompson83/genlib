// SPDX-License-Identifier: Apache-2.0

// Package polyline encodes and decodes the Google encoded polyline format
// (precision 5 for Google Maps, 6 for OSRM/Valhalla-style APIs).
package polyline

import (
	"errors"
	"math"
	"strings"
)

// DefaultPrecision is the Google Maps precision (1e-5 degrees).
const DefaultPrecision = 5

// Point is a latitude/longitude pair in degrees.
type Point struct{ Lat, Lon float64 }

func factor(precision int) (float64, error) {
	if precision < 0 || precision > 10 {
		return 0, errors.New("polyline: precision must be in 0..10")
	}
	return math.Pow(10, float64(precision)), nil
}

func scale(v, f float64) (int64, error) {
	s := v * f
	if math.IsNaN(s) || math.IsInf(s, 0) || math.Abs(s) > 1<<53 {
		return 0, errors.New("polyline: coordinate is not finite or too large")
	}
	r := math.Floor(math.Abs(s) + 0.5)
	if s < 0 {
		r = -r
	}
	return int64(r), nil
}

func writeValue(b *strings.Builder, d int64) {
	v := d << 1
	if d < 0 {
		v = ^v
	}
	u := uint64(v)
	for u >= 0x20 {
		b.WriteByte(byte(0x20|(u&0x1f)) + 63)
		u >>= 5
	}
	b.WriteByte(byte(u) + 63)
}

// Encode returns the encoded polyline for points at the given precision.
func Encode(points []Point, precision int) (string, error) {
	f, err := factor(precision)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	var plat, plon int64
	for _, p := range points {
		if p.Lat < -90 || p.Lat > 90 || p.Lon < -180 || p.Lon > 180 {
			return "", errors.New("polyline: latitude must be in [-90, 90] and longitude in [-180, 180]")
		}
		lat, err := scale(p.Lat, f)
		if err != nil {
			return "", err
		}
		lon, err := scale(p.Lon, f)
		if err != nil {
			return "", err
		}
		writeValue(&b, lat-plat)
		writeValue(&b, lon-plon)
		plat, plon = lat, lon
	}
	return b.String(), nil
}

func readValue(s string, i int) (int64, int, error) {
	var result uint64
	shift := uint(0)
	for {
		if i >= len(s) {
			return 0, i, errors.New("polyline: truncated input")
		}
		c := s[i]
		if c < 63 || c > 126 {
			return 0, i, errors.New("polyline: character outside 63..126")
		}
		if shift > 60 {
			return 0, i, errors.New("polyline: value too long")
		}
		chunk := uint64(c - 63)
		result |= (chunk & 0x1f) << shift
		shift += 5
		i++
		if chunk < 0x20 {
			break
		}
	}
	v := int64(result >> 1)
	if result&1 == 1 {
		v = ^v
	}
	return v, i, nil
}

// Decode parses an encoded polyline at the given precision.
func Decode(text string, precision int) ([]Point, error) {
	f, err := factor(precision)
	if err != nil {
		return nil, err
	}
	points := []Point{}
	var lat, lon int64
	for i := 0; i < len(text); {
		var dlat, dlon int64
		if dlat, i, err = readValue(text, i); err != nil {
			return nil, err
		}
		if dlon, i, err = readValue(text, i); err != nil {
			return nil, err
		}
		lat += dlat
		lon += dlon
		points = append(points, Point{float64(lat) / f, float64(lon) / f})
	}
	return points, nil
}
