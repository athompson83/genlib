// SPDX-License-Identifier: Apache-2.0
/// Great-circle distance, geohash encoding/decoding and radius bounding boxes.
library;

import 'dart:math' as math;

/// Mean Earth radius in meters (IUGG).
const earthRadiusMeters = 6371008.8;
const _base32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/// A decoded geohash cell: its center and the half-size of the cell in each axis.
class GeohashCell {
  final double lat, lon, latError, lonError;
  const GeohashCell(this.lat, this.lon, this.latError, this.lonError);
}

/// A latitude/longitude box (clamped to valid ranges; it does not wrap across the antimeridian).
class GeoBox {
  final double minLat, minLon, maxLat, maxLon;
  const GeoBox(this.minLat, this.minLon, this.maxLat, this.maxLon);
}

/// Haversine distance in meters between two points in degrees.
double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
  _checkPoint(lat1, lon1);
  _checkPoint(lat2, lon2);
  final p1 = _rad(lat1), p2 = _rad(lat2), dp = _rad(lat2 - lat1), dl = _rad(lon2 - lon1);
  final a = math.sin(dp / 2) * math.sin(dp / 2) + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) * math.sin(dl / 2);
  return 2 * earthRadiusMeters * math.atan2(math.sqrt(a), math.sqrt(math.max(0, 1 - a)));
}

/// Standard geohash of 1 to 12 characters (longitude bit first).
String geohashEncode(double lat, double lon, int precision) {
  _checkPoint(lat, lon);
  if (precision < 1 || precision > 12) throw RangeError.range(precision, 1, 12, 'precision');
  var latLo = -90.0, latHi = 90.0, lonLo = -180.0, lonHi = 180.0;
  var lonBit = true;
  final out = StringBuffer();
  for (var i = 0; i < precision; i++) {
    var idx = 0;
    for (var b = 0; b < 5; b++, lonBit = !lonBit) {
      if (lonBit) {
        final mid = (lonLo + lonHi) / 2;
        if (lon >= mid) {
          idx = idx * 2 + 1;
          lonLo = mid;
        } else {
          idx *= 2;
          lonHi = mid;
        }
      } else {
        final mid = (latLo + latHi) / 2;
        if (lat >= mid) {
          idx = idx * 2 + 1;
          latLo = mid;
        } else {
          idx *= 2;
          latHi = mid;
        }
      }
    }
    out.write(_base32[idx]);
  }
  return out.toString();
}

/// Decodes a 1-12 character geohash (case-insensitive) to its cell center and error; throws [FormatException] when invalid.
GeohashCell geohashDecode(String hash) {
  if (hash.isEmpty || hash.length > 12) throw FormatException('geohash must be 1 to 12 characters', hash);
  var latLo = -90.0, latHi = 90.0, lonLo = -180.0, lonHi = 180.0;
  var lonBit = true;
  for (var i = 0; i < hash.length; i++) {
    final idx = _base32.indexOf(hash[i].toLowerCase());
    if (idx < 0) throw FormatException('invalid geohash character', hash, i);
    for (var b = 4; b >= 0; b--, lonBit = !lonBit) {
      final upper = (idx >> b) & 1 == 1;
      if (lonBit) {
        final mid = (lonLo + lonHi) / 2;
        upper ? lonLo = mid : lonHi = mid;
      } else {
        final mid = (latLo + latHi) / 2;
        upper ? latLo = mid : latHi = mid;
      }
    }
  }
  return GeohashCell((latLo + latHi) / 2, (lonLo + lonHi) / 2, (latHi - latLo) / 2, (lonHi - lonLo) / 2);
}

/// A box containing every point within [radiusMeters] of the center.
GeoBox boundingBox(double lat, double lon, double radiusMeters) {
  _checkPoint(lat, lon);
  if (!radiusMeters.isFinite || radiusMeters < 0) throw RangeError.value(radiusMeters, 'radiusMeters', 'must be finite and >= 0');
  final angular = radiusMeters / earthRadiusMeters;
  final dLat = _deg(angular);
  final minLat = math.max(-90.0, lat - dLat), maxLat = math.min(90.0, lat + dLat);
  // Exact longitude half-width so the point due east/west on the same parallel is exactly radiusMeters away.
  final s = math.sin(angular / 2) / math.cos(_rad(lat));
  if (maxLat >= 90 || minLat <= -90 || angular >= math.pi || s >= 1) return GeoBox(minLat, -180, maxLat, 180);
  final dLon = _deg(2 * math.asin(s));
  return GeoBox(minLat, math.max(-180.0, lon - dLon), maxLat, math.min(180.0, lon + dLon));
}

double _rad(double d) => d * math.pi / 180;
double _deg(double r) => r * 180 / math.pi;

void _checkPoint(double lat, double lon) {
  if (!(lat >= -90 && lat <= 90)) throw RangeError.value(lat, 'lat', 'latitude must be in [-90, 90]');
  if (!(lon >= -180 && lon <= 180)) throw RangeError.value(lon, 'lon', 'longitude must be in [-180, 180]');
}
