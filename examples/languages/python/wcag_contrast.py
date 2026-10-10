# SPDX-License-Identifier: Apache-2.0
"""WCAG 2.x relative luminance, contrast ratio and AA/AAA checks for hex colors."""
import re
from decimal import ROUND_HALF_UP, Decimal

_HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})")
_THRESHOLDS = {("AA", False): 4.5, ("AA", True): 3.0, ("AAA", False): 7.0, ("AAA", True): 4.5}


def _channel(value: int) -> float:
    c = value / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    """Luminance of "#rgb" or "#rrggbb" (case-insensitive); raises ValueError otherwise."""
    match = _HEX.fullmatch(hex_color) if isinstance(hex_color, str) else None
    if not match:
        raise ValueError("color must be #rgb or #rrggbb")
    digits = match.group(1)
    if len(digits) == 3:
        digits = "".join(c * 2 for c in digits)
    r, g, b = (_channel(int(digits[i:i + 2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
    """(Lmax + 0.05) / (Lmin + 0.05), from 1.0 to 21.0."""
    la, lb = relative_luminance(a), relative_luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def contrast_ratio2(a: str, b: str) -> float:
    """Contrast ratio rounded to 2 decimals, half away from zero (for display only)."""
    return float(Decimal(repr(contrast_ratio(a, b))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def passes(ratio: float, level: str = "AA", large_text: bool = False) -> bool:
    """Compare the unrounded ratio with AA 4.5 (large 3.0) or AAA 7.0 (large 4.5)."""
    key = (level, bool(large_text))
    if key not in _THRESHOLDS:
        raise ValueError('level must be "AA" or "AAA"')
    return ratio >= _THRESHOLDS[key]
