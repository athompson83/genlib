// SPDX-License-Identifier: Apache-2.0
/// Bloom filter with deterministic hashing. The hash is FNV-1a 64-bit of the item's UTF-8 bytes; with h1 = low 32
/// bits and h2 = high 32 bits, position i (0..k-1) is (h1 + i*h2) mod 2^64 mod m, all unsigned. Bit j lives in byte
/// j>>3 at mask 1<<(j&7); the serialized state is unpadded base64url of those bytes. The Dart VM int is a signed 64-bit
/// value that wraps on overflow, so 64-bit hashes are returned as their two's-complement bit pattern and reduced with
/// an unsigned remainder. Failures throw [BloomException].
library;

import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

/// Invalid sizing parameters, a mismatched union or a malformed serialized state.
class BloomException implements Exception {
  final String message;
  const BloomException(this.message);
  @override
  String toString() => 'BloomException: $message';
}

const _fnvOffset = 0xcbf29ce484222325;
const _fnvPrime = 0x100000001b3;

/// FNV-1a 64-bit hash of [bytes], returned as the 64-bit pattern in a (possibly negative) Dart int.
int fnv1a64(List<int> bytes) {
  var h = _fnvOffset;
  for (final b in bytes) {
    h ^= b & 0xff;
    h *= _fnvPrime; // wraps modulo 2^64 on the VM
  }
  return h;
}

/// Unsigned remainder of the 64-bit pattern [x] by a positive [m].
int _umod(int x, int m) => x >= 0 ? x % m : (((x >>> 1) % m) * 2 + (x & 1)) % m;

/// Optimal bit count m (at least 8) and hash count k for [n] items at false-positive rate [p].
({int m, int k}) bloomSizeFor(int n, double p) {
  if (n < 1 || !(p > 0 && p < 1)) throw const BloomException('bad size');
  final ln2 = math.log(2);
  final m = math.max(8, (-n * math.log(p) / (ln2 * ln2)).ceil());
  final k = math.max(1, (m / n * ln2 + 0.5).floor());
  return (m: m, k: k);
}

/// A fixed-size Bloom filter of [m] bits and [k] hash positions per item.
class BloomFilter {
  final int m, k;
  final Uint8List _bits;

  /// Creates an empty filter; m >= 8 and 1 <= k <= 64.
  BloomFilter(int m, int k) : this._(m, k, null);

  BloomFilter._(this.m, this.k, List<int>? bits) : _bits = Uint8List((m + 7) >> 3) {
    if (m < 8 || k < 1 || k > 64) throw const BloomException('bad params');
    if (bits != null) _bits.setAll(0, bits);
  }

  /// The k bit positions of [item].
  List<int> positions(String item) {
    final h = fnv1a64(utf8.encode(item));
    final h1 = h & 0xffffffff, h2 = h >>> 32;
    return [for (var i = 0; i < k; i++) _umod(h1 + i * h2, m)];
  }

  /// Adds [item] to the filter.
  void add(String item) {
    for (final j in positions(item)) {
      _bits[j >> 3] |= 1 << (j & 7);
    }
  }

  /// True when every position of [item] is set (false positives are possible, false negatives are not).
  bool mightContain(String item) => positions(item).every((j) => _bits[j >> 3] & (1 << (j & 7)) != 0);

  /// Estimated number of distinct items added, or null when every bit is set (saturated).
  int? countEstimate() {
    var x = 0;
    for (var b in _bits) {
      while (b != 0) {
        x += b & 1;
        b >>= 1;
      }
    }
    if (x >= m) return null;
    return (-m / k * math.log(1 - x / m) + 0.5).floor();
  }

  /// The bit array as unpadded base64url.
  String serialize() => base64Url.encode(_bits).replaceAll('=', '');

  /// Restores a filter from [serialize] output; rejects a state whose length does not match m.
  static BloomFilter deserialize(int m, int k, String text) {
    List<int> raw;
    try {
      raw = base64Url.decode(base64Url.normalize(text));
    } on FormatException {
      throw const BloomException('invalid base64url');
    }
    if (raw.length != (m + 7) >> 3) throw const BloomException('length');
    return BloomFilter._(m, k, raw);
  }

  /// The bitwise union with [other], which must have the same m and k.
  BloomFilter union(BloomFilter other) {
    if (m != other.m || k != other.k) throw const BloomException('mismatch');
    return BloomFilter._(m, k, [for (var i = 0; i < _bits.length; i++) _bits[i] | other._bits[i]]);
  }
}
