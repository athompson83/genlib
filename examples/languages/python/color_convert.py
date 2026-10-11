# SPDX-License-Identifier: Apache-2.0
"""Color conversions: CSS hex, sRGB, HSL and OKLCH (Bjorn Ottosson's Oklab, 2020).

Channels r, g, b and alpha are 0..1 floats; HSL h is degrees in [0, 360), s and l are 0..1;
OKLCH L is 0..1, C >= 0 and h is degrees.
"""
import math
import re

_HEX = re.compile(r"#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})")


def parse_hex(text: str) -> tuple[float, float, float, float]:
    """'#rgb', '#rgba', '#rrggbb' or '#rrggbbaa' (case-insensitive) -> (r, g, b, a) in 0..1."""
    m = _HEX.fullmatch(text) if isinstance(text, str) else None
    if not m:
        raise ValueError("expected #rgb, #rgba, #rrggbb or #rrggbbaa")
    h = m.group(1)
    if len(h) <= 4:
        h = "".join(c * 2 for c in h)
    vals = [int(h[i:i + 2], 16) / 255 for i in range(0, len(h), 2)]
    return (vals[0], vals[1], vals[2], vals[3] if len(vals) == 4 else 1.0)


def _byte(v: float) -> int:
    return min(255, max(0, math.floor(min(1.0, max(0.0, v)) * 255 + 0.5)))


def to_hex(r: float, g: float, b: float, a: float = 1.0) -> str:
    """Lowercase #rrggbb (#rrggbbaa when a < 1); channels are clamped to 0..1 and rounded half up."""
    out = "#" + "".join(f"{_byte(v):02x}" for v in (r, g, b))
    if a < 1:
        out += f"{_byte(a):02x}"
    return out


def rgb_to_hsl(r: float, g: float, b: float) -> tuple[float, float, float]:
    """sRGB channels -> (h degrees, s, l)."""
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    d = mx - mn
    if d == 0:
        return (0.0, 0.0, l)
    s = d / (1 - abs(2 * l - 1))
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return ((h * 60) % 360, s, l)


def hsl_to_rgb(h: float, s: float, l: float) -> tuple[float, float, float]:
    """(h degrees, wrapped modulo 360; s; l) -> sRGB channels."""
    h = h % 360
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return (r + m, g + m, b + m)


def _linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _gamma(c: float) -> float:
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _cbrt(x: float) -> float:
    return math.copysign(abs(x) ** (1 / 3), x)


def rgb_to_oklch(r: float, g: float, b: float) -> tuple[float, float, float]:
    """sRGB channels -> (L, C, h degrees); h is 0 for achromatic colors."""
    r, g, b = _linear(r), _linear(g), _linear(b)
    l = _cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m = _cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s = _cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    big_l = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    big_a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    big_b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    c = math.hypot(big_a, big_b)
    h = math.degrees(math.atan2(big_b, big_a)) % 360 if c > 1e-7 else 0.0
    return (big_l, c, h)


def oklch_to_rgb(big_l: float, c: float, h: float) -> tuple[float, float, float]:
    """(L, C, h degrees) -> sRGB channels, not clamped (outside 0..1 means out of gamut)."""
    big_a, big_b = c * math.cos(math.radians(h)), c * math.sin(math.radians(h))
    l = (big_l + 0.3963377774 * big_a + 0.2158037573 * big_b) ** 3
    m = (big_l - 0.1055613458 * big_a - 0.0638541728 * big_b) ** 3
    s = (big_l - 0.0894841775 * big_a - 1.2914855480 * big_b) ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    return (_gamma(r), _gamma(g), _gamma(b))


def in_gamut(r: float, g: float, b: float, eps: float = 1e-9) -> bool:
    """True when every channel lies within 0..1 (with a small tolerance)."""
    return all(-eps <= v <= 1 + eps for v in (r, g, b))
