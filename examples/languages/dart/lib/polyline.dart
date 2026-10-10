// SPDX-License-Identifier: Apache-2.0
/// Google encoded polyline algorithm (precision 5 by default, 6 for OSRM/Valhalla).
library;

/// Encodes `(lat, lon)` points; throws [RangeError] for a bad precision or out-of-range coordinate.
String encodePolyline(List<(double, double)> points, {int precision = 5}) {
  final factor = _factor(precision);
  final out = StringBuffer();
  var prevLat = 0, prevLon = 0;
  for (final (lat, lon) in points) {
    if (!(lat >= -90 && lat <= 90)) throw RangeError.value(lat, 'lat', 'must be in [-90, 90]');
    if (!(lon >= -180 && lon <= 180)) throw RangeError.value(lon, 'lon', 'must be in [-180, 180]');
    final iLat = _round(lat * factor), iLon = _round(lon * factor);
    _write(out, iLat - prevLat);
    _write(out, iLon - prevLon);
    prevLat = iLat;
    prevLon = iLon;
  }
  return out.toString();
}

/// Decodes [text]; throws [FormatException] for characters outside 63..126 or truncated input.
List<(double, double)> decodePolyline(String text, {int precision = 5}) {
  final factor = _factor(precision);
  final points = <(double, double)>[];
  var i = 0, lat = 0, lon = 0;
  int next() {
    var result = 0, shift = 0;
    while (true) {
      if (i >= text.length) throw FormatException('truncated polyline', text, i);
      final c = text.codeUnitAt(i++) - 63;
      if (c < 0 || c > 63) throw FormatException('invalid polyline character', text, i - 1);
      if (shift > 60) throw FormatException('polyline value too long', text, i - 1);
      result |= (c & 0x1f) << shift;
      shift += 5;
      if (c < 0x20) break;
    }
    return (result & 1) == 1 ? ~(result >> 1) : result >> 1;
  }

  while (i < text.length) {
    lat += next();
    if (i >= text.length) throw FormatException('truncated polyline: latitude without longitude', text, i);
    lon += next();
    points.add((lat / factor, lon / factor));
  }
  return points;
}

double _factor(int precision) {
  if (precision < 0 || precision > 10) throw RangeError.range(precision, 0, 10, 'precision');
  var f = 1;
  for (var i = 0; i < precision; i++) {
    f *= 10;
  }
  return f.toDouble();
}

int _round(double v) => v >= 0 ? (v + 0.5).floor() : -((-v + 0.5).floor());

void _write(StringBuffer out, int delta) {
  var v = delta < 0 ? ~(delta << 1) : delta << 1;
  while (v >= 0x20) {
    out.writeCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out.writeCharCode(v + 63);
}
