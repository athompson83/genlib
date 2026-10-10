# SPDX-License-Identifier: Apache-2.0
"""Non-cryptographic hashes: CRC-32 (IEEE), FNV-1a 32/64, MurmurHash3 x86_32 and jump consistent hash.

For checksums, sharding, cache keys and bucketing only. Never use them for passwords, MACs,
signatures or anything an attacker must not be able to collide; use hashlib/hmac for that.
"""

_CRC_TABLE = []
for _n in range(256):
    _c = _n
    for _ in range(8):
        _c = (_c >> 1) ^ 0xEDB88320 if _c & 1 else _c >> 1
    _CRC_TABLE.append(_c)

_M32 = 0xFFFFFFFF
_M64 = 0xFFFFFFFFFFFFFFFF


def crc32(data: bytes) -> int:
    """IEEE 802.3 CRC-32 (reflected, polynomial 0xEDB88320); crc32(b"123456789") == 0xCBF43926."""
    c = _M32
    for b in bytes(data):
        c = _CRC_TABLE[(c ^ b) & 0xFF] ^ (c >> 8)
    return c ^ _M32


def fnv1a32(data: bytes) -> int:
    h = 0x811C9DC5
    for b in bytes(data):
        h = ((h ^ b) * 0x01000193) & _M32
    return h


def fnv1a64(data: bytes) -> int:
    h = 0xCBF29CE484222325
    for b in bytes(data):
        h = ((h ^ b) * 0x100000001B3) & _M64
    return h


def _rotl(x: int, r: int) -> int:
    return ((x << r) | (x >> (32 - r))) & _M32


def _mix(k: int) -> int:
    k = (k * 0xCC9E2D51) & _M32
    return (_rotl(k, 15) * 0x1B873593) & _M32


def murmur3_32(data: bytes, seed: int = 0) -> int:
    """MurmurHash3 x86_32 with little-endian 4-byte blocks."""
    data = bytes(data)
    h, n = seed & _M32, len(data)
    full = n - n % 4
    for i in range(0, full, 4):
        h ^= _mix(int.from_bytes(data[i:i + 4], "little"))
        h = (_rotl(h, 13) * 5 + 0xE6546B64) & _M32
    if n % 4:
        h ^= _mix(int.from_bytes(data[full:], "little"))
    h ^= n
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & _M32
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & _M32
    return h ^ (h >> 16)


def jump_hash(key: int, buckets: int) -> int:
    """Lamping & Veach jump consistent hash: unsigned 64-bit key -> bucket in [0, buckets)."""
    if isinstance(key, bool) or not isinstance(key, int) or not 0 <= key <= _M64:
        raise ValueError("key must be an unsigned 64-bit integer")
    if isinstance(buckets, bool) or not isinstance(buckets, int) or not 1 <= buckets <= 2**31 - 1:
        raise ValueError("buckets must be in 1..2^31-1")
    b, j = -1, 0
    while j < buckets:
        b = j
        key = (key * 2862933555777941757 + 1) & _M64
        j = int((b + 1) * (float(1 << 31) / float((key >> 33) + 1)))
    return b
