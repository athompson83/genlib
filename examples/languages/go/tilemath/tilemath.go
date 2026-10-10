// SPDX-License-Identifier: Apache-2.0

// Package tilemath converts between longitude/latitude, Web Mercator
// (EPSG:3857) meters, slippy-map tile coordinates and Bing quadkeys.
package tilemath

import (
	"errors"
	"math"
	"strings"
)

// MaxLatitude is the Web Mercator latitude limit in degrees.
const MaxLatitude = 85.05112877980659

// EarthRadiusM is the WGS 84 semi-major axis used by Web Mercator.
const EarthRadiusM = 6378137.0

// MaxZoom is the highest supported zoom level.
const MaxZoom = 24

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func checkZoom(zoom int) error {
	if zoom < 0 || zoom > MaxZoom {
		return errors.New("tilemath: zoom must be in 0..24")
	}
	return nil
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// LonLatToTile returns the tile (x, y) containing lon/lat at zoom. Latitude
// is clamped to the Mercator limit.
func LonLatToTile(lon, lat float64, zoom int) (int, int, error) {
	if err := checkZoom(zoom); err != nil {
		return 0, 0, err
	}
	if !finite(lon) || !finite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90 {
		return 0, 0, errors.New("tilemath: longitude must be in [-180, 180] and latitude in [-90, 90]")
	}
	n := float64(int64(1) << uint(zoom))
	r := clamp(lat, -MaxLatitude, MaxLatitude) * math.Pi / 180
	x := math.Floor((lon + 180) / 360 * n)
	y := math.Floor((1 - math.Log(math.Tan(r)+1/math.Cos(r))/math.Pi) / 2 * n)
	return int(clamp(x, 0, n-1)), int(clamp(y, 0, n-1)), nil
}

func checkTile(x, y, zoom int) error {
	if err := checkZoom(zoom); err != nil {
		return err
	}
	max := (1 << uint(zoom)) - 1
	if x < 0 || x > max || y < 0 || y > max {
		return errors.New("tilemath: tile x and y must be in [0, 2^zoom-1]")
	}
	return nil
}

// TileBounds returns [west, south, east, north] in degrees.
func TileBounds(x, y, zoom int) ([4]float64, error) {
	if err := checkTile(x, y, zoom); err != nil {
		return [4]float64{}, err
	}
	n := float64(int64(1) << uint(zoom))
	lon := func(v int) float64 { return float64(v)/n*360 - 180 }
	lat := func(v int) float64 { return math.Atan(math.Sinh(math.Pi*(1-2*float64(v)/n))) * 180 / math.Pi }
	return [4]float64{lon(x), lat(y + 1), lon(x + 1), lat(y)}, nil
}

// TileToQuadkey returns the Bing Maps quadkey for a tile.
func TileToQuadkey(x, y, zoom int) (string, error) {
	if err := checkTile(x, y, zoom); err != nil {
		return "", err
	}
	var b strings.Builder
	for i := zoom; i > 0; i-- {
		m := 1 << uint(i-1)
		d := byte('0')
		if x&m != 0 {
			d++
		}
		if y&m != 0 {
			d += 2
		}
		b.WriteByte(d)
	}
	return b.String(), nil
}

// QuadkeyToTile parses a quadkey into (x, y, zoom); "" is the zoom 0 tile.
func QuadkeyToTile(key string) (int, int, int, error) {
	if len(key) > MaxZoom {
		return 0, 0, 0, errors.New("tilemath: quadkey longer than 24 digits")
	}
	x, y := 0, 0
	for i := 0; i < len(key); i++ {
		c := key[i]
		if c < '0' || c > '3' {
			return 0, 0, 0, errors.New("tilemath: quadkey digits must be 0-3")
		}
		d := int(c - '0')
		x = x<<1 | d&1
		y = y<<1 | d>>1
	}
	return x, y, len(key), nil
}

// LonLatToMercator returns EPSG:3857 [x, y] meters.
func LonLatToMercator(lon, lat float64) ([2]float64, error) {
	if !finite(lon) || !finite(lat) || lon < -180 || lon > 180 || math.Abs(lat) > MaxLatitude+1e-9 {
		return [2]float64{}, errors.New("tilemath: longitude must be in [-180, 180] and |latitude| <= 85.05112877980659")
	}
	r := lat * math.Pi / 180
	return [2]float64{lon * math.Pi / 180 * EarthRadiusM, math.Log(math.Tan(math.Pi/4+r/2)) * EarthRadiusM}, nil
}
