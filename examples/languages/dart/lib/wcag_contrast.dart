// SPDX-License-Identifier: Apache-2.0
/// WCAG 2.x relative luminance and contrast ratio for #rgb / #rrggbb colors.
library;

import 'dart:math' as math;

final _hexColor = RegExp(r'^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$');

/// WCAG conformance level.
enum WcagLevel { aa, aaa }

/// Relative luminance in [0, 1]; throws [FormatException] for anything but #rgb or #rrggbb.
double relativeLuminance(String hex) {
  if (!_hexColor.hasMatch(hex)) throw FormatException('color must be #rgb or #rrggbb', hex);
  final h = hex.length == 4 ? hex.substring(1).split('').map((c) => '$c$c').join() : hex.substring(1);
  double channel(int i) {
    final c = int.parse(h.substring(i * 2, i * 2 + 2), radix: 16) / 255.0;
    return c <= 0.04045 ? c / 12.92 : math.pow((c + 0.055) / 1.055, 2.4).toDouble();
  }

  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/// (Lmax + 0.05) / (Lmin + 0.05), from 1 to 21.
double contrastRatio(String a, String b) {
  final la = relativeLuminance(a), lb = relativeLuminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// The contrast ratio rounded to 2 decimals, half away from zero (for display).
double contrastRatio2(String a, String b) => (contrastRatio(a, b) * 100).round() / 100;

/// Whether an unrounded [ratio] meets [level]: AA 4.5 (large 3.0) or AAA 7.0 (large 4.5).
bool passes(double ratio, WcagLevel level, {bool largeText = false}) => switch (level) {
      WcagLevel.aa => ratio >= (largeText ? 3.0 : 4.5),
      WcagLevel.aaa => ratio >= (largeText ? 4.5 : 7.0),
    };
