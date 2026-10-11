# SPDX-License-Identifier: Apache-2.0
"""Roman numerals 1..3999 in standard subtractive form.

from_roman is case-insensitive but accepts only the canonical form: a string is valid exactly when
to_roman(value) equals it upper-cased, so 'IIII', 'IC', 'VX' and '' are rejected.
"""

_PAIRS = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"),
          (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


class RomanError(ValueError):
    """Raised for a number outside 1..3999 or a non-canonical numeral."""


def to_roman(n: int) -> str:
    """Format an integer 1..3999 as an upper-case Roman numeral."""
    if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= 3999:
        raise RomanError("out of range")
    out = []
    for value, symbol in _PAIRS:
        while n >= value:
            out.append(symbol)
            n -= value
    return "".join(out)


def from_roman(s: str) -> int:
    """Parse a canonical Roman numeral (any case) to its integer value."""
    u = s.upper()
    if not u or any(c not in _VALUES for c in u):
        raise RomanError("not a roman numeral")
    total = 0
    for i, c in enumerate(u):
        v = _VALUES[c]
        total += -v if i + 1 < len(u) and _VALUES[u[i + 1]] > v else v
    if not 1 <= total <= 3999 or to_roman(total) != u:
        raise RomanError("not a canonical roman numeral")
    return total
