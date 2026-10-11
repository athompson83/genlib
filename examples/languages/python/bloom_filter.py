# SPDX-License-Identifier: Apache-2.0
"""Bloom filter with deterministic FNV-1a double hashing and a portable serialized form.

Sizing: m = ceil(-n ln p / ln(2)^2) bits (at least 8) and k = max(1, floor(m/n ln 2 + 0.5)). An item
is hashed as h = FNV-1a 64 of its UTF-8 bytes; h1 = low 32 bits, h2 = high 32 bits and position i is
(h1 + i*h2) mod 2^64 mod m. Bit j lives in byte j >> 3 under mask 1 << (j & 7); serialize() is
base64url without padding of the ceil(m/8) bytes, so filters move between the Genlib languages.
count_estimate() is -m/k ln(1 - X/m) rounded half up (X = set bits), or None when saturated.
"""

import base64
import math

_M64 = (1 << 64) - 1


class BloomError(ValueError):
    """Raised for invalid sizes, parameters, serialized state or mismatched unions."""


def fnv1a64(data: bytes) -> int:
    """FNV-1a 64-bit hash of bytes."""
    h = 0xCBF29CE484222325
    for b in data:
        h = ((h ^ b) * 0x100000001B3) & _M64
    return h


def bloom_size_for(n: int, p: float) -> tuple[int, int]:
    """Bits m and hash count k for n items at false-positive rate p."""
    if isinstance(n, bool) or not isinstance(n, int) or n < 1 or not 0 < p < 1:
        raise BloomError("n must be >= 1 and 0 < p < 1")
    m = max(8, math.ceil(-n * math.log(p) / (math.log(2) ** 2)))
    return m, max(1, math.floor(m / n * math.log(2) + 0.5))


class BloomFilter:
    """A Bloom filter of m bits and k hash positions per item."""

    def __init__(self, m: int, k: int, bits: bytes | None = None):
        """Create an empty filter, or one with the given ceil(m/8) bytes of state."""
        if m < 8 or not 1 <= k <= 64:
            raise BloomError("m must be >= 8 and 1 <= k <= 64")
        size = (m + 7) // 8
        if bits is not None and len(bits) != size:
            raise BloomError("state length does not match m")
        self.m, self.k = m, k
        self.bits = bytearray(bits) if bits is not None else bytearray(size)

    def positions(self, item: str) -> list[int]:
        """The k bit positions for an item."""
        h = fnv1a64(item.encode("utf-8"))
        h1, h2 = h & 0xFFFFFFFF, h >> 32
        return [((h1 + i * h2) & _M64) % self.m for i in range(self.k)]

    def add(self, item: str) -> None:
        """Add an item."""
        for j in self.positions(item):
            self.bits[j >> 3] |= 1 << (j & 7)

    def might_contain(self, item: str) -> bool:
        """False when the item was certainly never added; True when it probably was."""
        return all(self.bits[j >> 3] & (1 << (j & 7)) for j in self.positions(item))

    def count_estimate(self) -> int | None:
        """Estimated number of distinct items added, or None when every bit is set."""
        x = sum(bin(b).count("1") for b in self.bits)
        if x >= self.m:
            return None
        return math.floor(-self.m / self.k * math.log(1 - x / self.m) + 0.5)

    def serialize(self) -> str:
        """The bit array as base64url without padding."""
        return base64.urlsafe_b64encode(bytes(self.bits)).rstrip(b"=").decode("ascii")

    @staticmethod
    def deserialize(m: int, k: int, text: str) -> "BloomFilter":
        """Rebuild a filter from serialize() output; rejects bad base64url or a wrong length."""
        if len(text) % 4 == 1 or any(c not in _B64URL for c in text):
            raise BloomError("invalid base64url state")
        raw = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
        return BloomFilter(m, k, raw)

    def union(self, other: "BloomFilter") -> "BloomFilter":
        """A new filter containing the items of both (same m and k required)."""
        if (self.m, self.k) != (other.m, other.k):
            raise BloomError("filters differ in m or k")
        return BloomFilter(self.m, self.k, bytes(a | b for a, b in zip(self.bits, other.bits)))


_B64URL = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
