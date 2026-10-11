# SPDX-License-Identifier: Apache-2.0
"""Password and passphrase generation with an injectable byte source.

Every function takes next_byte, a callable returning an int 0..255. When it is omitted the
platform CSPRNG (``secrets``) is used; pass a deterministic source only in tests. random_index is
unbiased (rejection sampling over k big-endian bytes). generate_password picks one character from
each class in class order, fills the rest from the union of the classes, then Fisher-Yates shuffles.
With exclude_ambiguous the characters 'Il1O0o' are removed from every class.
"""

import math
import secrets
from collections.abc import Callable, Sequence

CLASSES = {
    "lower": "abcdefghijklmnopqrstuvwxyz",
    "upper": "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    "digits": "0123456789",
    "symbols": "!#$%&*+-=?@^_~",
}
DEFAULT_CLASSES = ("lower", "upper", "digits", "symbols")
_AMBIGUOUS = "Il1O0o"

NextByte = Callable[[], int]


class PassGenError(ValueError):
    """Raised for invalid lengths, classes, word lists or counts."""


def system_byte() -> int:
    """One byte from the operating system CSPRNG (the default byte source)."""
    return secrets.randbits(8)


def random_index(n: int, next_byte: NextByte | None = None) -> int:
    """Unbiased index in [0, n) using rejection sampling over big-endian bytes."""
    nb = next_byte or system_byte
    if isinstance(n, bool) or not isinstance(n, int) or n < 1:
        raise PassGenError("n must be a positive integer")
    if n == 1:
        return 0
    k = 1
    while 256**k < n:
        k += 1
    limit = (256**k // n) * n
    while True:
        x = 0
        for _ in range(k):
            x = x * 256 + nb()
        if x < limit:
            return x % n


def generate_password(length: int = 16, classes: Sequence[str] = DEFAULT_CLASSES,
                      next_byte: NextByte | None = None, exclude_ambiguous: bool = False) -> str:
    """Random password containing at least one character of each class (CSPRNG unless next_byte is given)."""
    nb = next_byte or system_byte
    classes = list(classes)
    if not classes or len(set(classes)) != len(classes) or any(c not in CLASSES for c in classes):
        raise PassGenError("bad classes")
    if isinstance(length, bool) or not isinstance(length, int) or not len(classes) <= length <= 1024:
        raise PassGenError("bad length")
    alphabets = ["".join(ch for ch in CLASSES[c] if not (exclude_ambiguous and ch in _AMBIGUOUS)) for c in classes]
    out = [a[random_index(len(a), nb)] for a in alphabets]
    union = "".join(alphabets)
    out += [union[random_index(len(union), nb)] for _ in range(length - len(classes))]
    for i in range(len(out) - 1, 0, -1):
        j = random_index(i + 1, nb)
        out[i], out[j] = out[j], out[i]
    return "".join(out)


def generate_passphrase(words: Sequence[str], count: int = 5, separator: str = "-",
                        next_byte: NextByte | None = None) -> str:
    """Join count words chosen uniformly from words (CSPRNG unless next_byte is given)."""
    nb = next_byte or system_byte
    words = list(words)
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 64:
        raise PassGenError("bad count")
    if len(set(words)) < 2 or any(not w for w in words):
        raise PassGenError("need at least 2 distinct non-empty words")
    return separator.join(words[random_index(len(words), nb)] for _ in range(count))


def entropy_bits(alphabet_size: int, length: int) -> float:
    """length * log2(alphabet_size), rounded to 2 decimals (for strength meters)."""
    if alphabet_size < 1 or length < 0:
        raise PassGenError("bad arguments")
    return round(length * math.log2(alphabet_size), 2)
