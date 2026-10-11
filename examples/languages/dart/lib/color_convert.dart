// SPDX-License-Identifier: Apache-2.0
/// Color conversions: CSS hex, sRGB, HSL and OKLCH (Björn Ottosson's Oklab, 2020). Channels r, g, b and alpha are 0..1
/// doubles; HSL h is degrees [0, 360) with s and l in 0..1; OKLCH L is 0..1, C >= 0 and h in degrees.
library;

import 'dart:math' as math;

final _hex = RegExp(r'^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$');

/// "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) to (r, g, b, a) in 0..1; throws [FormatException] otherwise.
(double, double, double, double) parseHex(String text) {
  if (!_hex.hasMatch(text)) throw FormatException('expected #rgb, #rgba, #rrggbb or #rrggbbaa', text);
  var h = text.substring(1);
  if (h.length <= 4) h = h.split('').map((c) => '$c$c').join();
  final v = [for (var i = 0; i < h.length; i += 2) int.parse(h.substring(i, i + 2), radix: 16) / 255];
  return (v[0], v[1], v[2], v.length == 4 ? v[3] : 1.0);
}

int _byte(double v) => (v * 255 + 0.5).floor().clamp(0, 255);

/// Lowercase "#rrggbb" (or "#rrggbbaa" when a < 1); channels are clamped to 0..1 and rounded half up.
String toHex(double r, double g, double b, [double a = 1.0]) {
  String ch(double v) => _byte(v.clamp(0.0, 1.0)).toRadixString(16).padLeft(2, '0');
  var out = '#${ch(r)}${ch(g)}${ch(b)}';
  if (a < 1) out += _byte(math.max(0.0, a)).toRadixString(16).padLeft(2, '0');
  return out;
}

/// sRGB (0..1) to HSL (h degrees in [0, 360), s and l in 0..1).
(double, double, double) rgbToHsl(double r, double g, double b) {
  final mx = math.max(r, math.max(g, b)), mn = math.min(r, math.min(g, b)), l = (mx + mn) / 2, d = mx - mn;
  if (d == 0) return (0.0, 0.0, l);
  final s = d / (1 - (2 * l - 1).abs());
  double h;
  if (mx == r) {
    h = ((g - b) / d) % 6;
  } else if (mx == g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return ((h * 60) % 360, s, l);
}

/// HSL (h wraps modulo 360) to sRGB channels in 0..1.
(double, double, double) hslToRgb(double h, double s, double l) {
  h = h % 360;
  final c = (1 - (2 * l - 1).abs()) * s, x = c * (1 - ((h / 60) % 2 - 1).abs()), m = l - c / 2;
  final (r, g, b) = switch ((h / 60).floor() % 6) {
    0 => (c, x, 0.0),
    1 => (x, c, 0.0),
    2 => (0.0, c, x),
    3 => (0.0, x, c),
    4 => (x, 0.0, c),
    _ => (c, 0.0, x),
  };
  return (r + m, g + m, b + m);
}

double _lin(double c) => c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
double _gam(double c) => c <= 0.0031308 ? 12.92 * c : 1.055 * math.pow(c, 1 / 2.4) - 0.055;
double _cbrt(double x) => (x < 0 ? -1.0 : 1.0) * math.pow(x.abs(), 1 / 3).toDouble();
double _cube(double x) => math.pow(x, 3).toDouble();

/// sRGB (0..1) to OKLCH (L, C, h degrees; h is 0 for achromatic colors with C <= 1e-7).
(double, double, double) rgbToOklch(double r, double g, double b) {
  r = _lin(r);
  g = _lin(g);
  b = _lin(b);
  final l = _cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  final m = _cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  final s = _cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  final bigL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  final bigA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  final bigB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  final c = math.sqrt(bigA * bigA + bigB * bigB);
  final h = c > 1e-7 ? (math.atan2(bigB, bigA) * (180 / math.pi)) % 360 : 0.0;
  return (bigL, c, h);
}

/// OKLCH to sRGB channels, not clamped (values outside 0..1 mean the color is outside the sRGB gamut).
(double, double, double) oklchToRgb(double lightness, double chroma, double hue) {
  final rad = hue * (math.pi / 180), a = chroma * math.cos(rad), b = chroma * math.sin(rad);
  final l = _cube(lightness + 0.3963377774 * a + 0.2158037573 * b);
  final m = _cube(lightness - 0.1055613458 * a - 0.0638541728 * b);
  final s = _cube(lightness - 0.0894841775 * a - 1.2914855480 * b);
  final r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  final g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  final bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return (_gam(r), _gam(g), _gam(bl));
}

/// True when every channel lies in 0..1 within [eps].
bool inGamut(double r, double g, double b, [double eps = 1e-9]) => [r, g, b].every((v) => v >= -eps && v <= 1 + eps);
