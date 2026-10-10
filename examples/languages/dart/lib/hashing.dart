// SPDX-License-Identifier: Apache-2.0
/// Non-cryptographic hashes for checksums, sharding and bucketing: CRC-32, FNV-1a, MurmurHash3 x86_32 and jump
/// consistent hash. Never use them for passwords, MACs, signatures or anything an attacker must not forge.
///
/// 32-bit results are non-negative [int]s. 64-bit values ([fnv1a64], [jumpHash] keys) are unsigned [BigInt]s so the
/// arithmetic is exact on every Dart platform.
library;

final _mask64 = (BigInt.one << 64) - BigInt.one;
final _fnv64Offset = BigInt.parse('cbf29ce484222325', radix: 16);
final _fnv64Prime = BigInt.parse('100000001b3', radix: 16);
final _jumpMultiplier = BigInt.parse('2862933555777941757');

final List<int> _crcTable = List<int>.generate(256, (n) {
  var c = n;
  for (var k = 0; k < 8; k++) {
    c = (c & 1) != 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c;
}, growable: false);

/// 32-bit multiply modulo 2^32 without relying on 64-bit integer overflow.
int _mul32(int a, int b) => (((a & 0xffff) * b) + ((((a >>> 16) * b) & 0xffff) << 16)) & 0xffffffff;

int _rotl32(int x, int r) => ((x << r) | (x >>> (32 - r))) & 0xffffffff;

/// CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320, init and xorout 0xFFFFFFFF).
int crc32(List<int> bytes) {
  var c = 0xffffffff;
  for (final b in bytes) {
    c = _crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) & 0xffffffff;
}

/// 32-bit FNV-1a.
int fnv1a32(List<int> bytes) {
  var h = 0x811c9dc5;
  for (final b in bytes) {
    h = _mul32(h ^ (b & 255), 0x01000193);
  }
  return h;
}

/// 64-bit FNV-1a (offset basis 0xcbf29ce484222325, prime 0x100000001b3) as an unsigned [BigInt].
BigInt fnv1a64(List<int> bytes) {
  var h = _fnv64Offset;
  for (final b in bytes) {
    h = ((h ^ BigInt.from(b & 255)) * _fnv64Prime) & _mask64;
  }
  return h;
}

/// MurmurHash3 x86_32 with little-endian 4-byte blocks.
int murmur3_32(List<int> bytes, [int seed = 0]) {
  const c1 = 0xcc9e2d51, c2 = 0x1b873593;
  var h = seed & 0xffffffff;
  final n = bytes.length, blocks = n - n % 4;
  for (var i = 0; i < blocks; i += 4) {
    var k = (bytes[i] & 255) | ((bytes[i + 1] & 255) << 8) | ((bytes[i + 2] & 255) << 16) | ((bytes[i + 3] & 255) << 24);
    k = _mul32(_rotl32(_mul32(k, c1), 15), c2);
    h = _rotl32(h ^ k, 13);
    h = (_mul32(h, 5) + 0xe6546b64) & 0xffffffff;
  }
  var t = 0;
  for (var i = n - 1; i >= blocks; i--) {
    t = (t << 8) | (bytes[i] & 255);
  }
  if (n > blocks) h ^= _mul32(_rotl32(_mul32(t, c1), 15), c2);
  h ^= n & 0xffffffff;
  h ^= h >>> 16;
  h = _mul32(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = _mul32(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h;
}

/// Lamping and Veach jump consistent hash: maps an unsigned 64-bit [key] to a bucket in `[0, buckets)`, moving only
/// about 1/buckets of the keys when a bucket is added. [buckets] is 1..2^31-1.
int jumpHash(BigInt key, int buckets) {
  if (buckets < 1 || buckets > 0x7fffffff) throw RangeError.range(buckets, 1, 0x7fffffff, 'buckets');
  if (key.isNegative || key > _mask64) throw RangeError.value(0, 'key', 'must be an unsigned 64-bit value');
  var b = -1, j = 0;
  var k = key;
  while (j < buckets) {
    b = j;
    k = (k * _jumpMultiplier + BigInt.one) & _mask64;
    j = ((b + 1) * (2147483648.0 / ((k >> 33) + BigInt.one).toDouble())).toInt();
  }
  return b;
}
