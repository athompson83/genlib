// SPDX-License-Identifier: Apache-2.0
/// Web Mercator (EPSG:3857) slippy-map tiles, Bing quadkeys and spherical Mercator meters.
library;

import 'dart:math' as math;

/// Latitude limit of the square Web Mercator world, in degrees.
const maxMercatorLatitude = 85.05112877980659;

/// Spherical Mercator radius in meters (WGS 84 semi-major axis).
const mercatorRadiusMeters = 6378137.0;

/// The tile containing `(lon, lat)` at [zoom] 0..24 (latitude is clamped to the Mercator limit).
({int x, int y}) lonLatToTile(double lon, double lat, int zoom) {
  _checkZoom(zoom);
  if (!(lon >= -180 && lon <= 180)) throw RangeError.value(lon, 'lon', 'must be in [-180, 180]');
  if (!(lat >= -90 && lat <= 90)) throw RangeError.value(lat, 'lat', 'must be in [-90, 90]');
  final n = 1 << zoom;
  final clamped = lat.clamp(-maxMercatorLatitude, maxMercatorLatitude).toDouble();
  final r = clamped * math.pi / 180;
  final x = ((lon + 180) / 360 * n).floor();
  final y = ((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n).floor();
  return (x: x.clamp(0, n - 1), y: y.clamp(0, n - 1));
}

/// The tile's `[west, south, east, north]` edges in degrees.
({double west, double south, double east, double north}) tileBounds(int x, int y, int zoom) {
  _checkTile(x, y, zoom);
  final n = 1 << zoom;
  double lon(int xx) => xx / n * 360 - 180;
  double lat(int yy) {
    final t = math.pi * (1 - 2 * yy / n);
    return math.atan((math.exp(t) - math.exp(-t)) / 2) * 180 / math.pi;
  }

  return (west: lon(x), south: lat(y + 1), east: lon(x + 1), north: lat(y));
}

/// Bing Maps quadkey for a tile ('' at zoom 0).
String tileToQuadkey(int x, int y, int zoom) {
  _checkTile(x, y, zoom);
  final out = StringBuffer();
  for (var i = zoom; i > 0; i--) {
    final mask = 1 << (i - 1);
    out.write(((x & mask) != 0 ? 1 : 0) + ((y & mask) != 0 ? 2 : 0));
  }
  return out.toString();
}

/// The tile named by a quadkey of digits 0-3 (at most 24); throws [FormatException] when invalid.
({int x, int y, int zoom}) quadkeyToTile(String key) {
  if (key.length > 24) throw FormatException('quadkey longer than 24 digits', key);
  var x = 0, y = 0;
  for (var i = 0; i < key.length; i++) {
    final d = key.codeUnitAt(i) - 0x30;
    if (d < 0 || d > 3) throw FormatException('quadkey digits must be 0-3', key, i);
    x = (x << 1) | (d & 1);
    y = (y << 1) | (d >> 1);
  }
  return (x: x, y: y, zoom: key.length);
}

/// Spherical Mercator `[x, y]` in meters; throws [RangeError] beyond the Mercator latitude limit.
({double x, double y}) lonLatToMercator(double lon, double lat) {
  if (!(lon >= -180 && lon <= 180)) throw RangeError.value(lon, 'lon', 'must be in [-180, 180]');
  if (!(lat.abs() <= maxMercatorLatitude + 1e-9)) throw RangeError.value(lat, 'lat', 'must be within the Mercator limit');
  final r = lat * math.pi / 180;
  return (x: lon * math.pi / 180 * mercatorRadiusMeters, y: math.log(math.tan(math.pi / 4 + r / 2)) * mercatorRadiusMeters);
}

void _checkZoom(int zoom) {
  if (zoom < 0 || zoom > 24) throw RangeError.range(zoom, 0, 24, 'zoom');
}

void _checkTile(int x, int y, int zoom) {
  _checkZoom(zoom);
  final max = (1 << zoom) - 1;
  if (x < 0 || x > max) throw RangeError.range(x, 0, max, 'x');
  if (y < 0 || y > max) throw RangeError.range(y, 0, max, 'y');
}
