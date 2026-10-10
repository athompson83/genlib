# SPDX-License-Identifier: Apache-2.0
"""Google encoded polyline algorithm (precision 5 by default; OSRM/Valhalla often use 6)."""
import math


def _check_precision(precision: int) -> int:
    if isinstance(precision, bool) or not isinstance(precision, int) or not 0 <= precision <= 10:
        raise ValueError("precision must be an integer from 0 to 10")
    return precision


def _round(v: float) -> int:
    """Round half away from zero."""
    r = int(math.floor(abs(v) + 0.5))
    return r if v >= 0 else -r


def encode_polyline(points, precision: int = 5) -> str:
    factor = 10 ** _check_precision(precision)
    out: list[str] = []
    prev_lat = prev_lon = 0
    for point in points:
        lat, lon = point
        if not (math.isfinite(lat) and math.isfinite(lon)):
            raise ValueError("coordinates must be finite numbers")
        ilat, ilon = _round(lat * factor), _round(lon * factor)
        for delta in (ilat - prev_lat, ilon - prev_lon):
            v = ~(delta << 1) if delta < 0 else delta << 1
            while v >= 0x20:
                out.append(chr((0x20 | (v & 0x1F)) + 63))
                v >>= 5
            out.append(chr(v + 63))
        prev_lat, prev_lon = ilat, ilon
    return "".join(out)


def decode_polyline(text: str, precision: int = 5) -> list[tuple[float, float]]:
    factor = 10 ** _check_precision(precision)
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    points: list[tuple[float, float]] = []
    index, lat, lon = 0, 0, 0
    n = len(text)

    def next_value() -> int:
        nonlocal index
        result, shift = 0, 0
        while True:
            if index >= n:
                raise ValueError("truncated polyline")
            b = ord(text[index]) - 63
            index += 1
            if b < 0 or b > 63:
                raise ValueError(f"invalid polyline character at {index - 1}")
            if shift > 60:
                raise ValueError("polyline value too long")
            result |= (b & 0x1F) << shift
            shift += 5
            if b < 0x20:
                break
        return ~(result >> 1) if result & 1 else result >> 1

    while index < n:
        lat += next_value()
        lon += next_value()
        points.append((lat / factor, lon / factor))
    return points
