# SPDX-License-Identifier: Apache-2.0
"""Great-circle distance, geohash encode/decode and a radius bounding box (spherical Earth)."""
import math
from typing import NamedTuple

EARTH_RADIUS_M = 6371008.8
GEOHASH_ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"


class GeohashCell(NamedTuple):
    lat: float
    lon: float
    lat_error: float
    lon_error: float


class BoundingBox(NamedTuple):
    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


def _check(lat: float, lon: float) -> None:
    for value, name, limit in ((lat, "latitude", 90), (lon, "longitude", 180)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not -limit <= value <= limit:
            raise ValueError(f"{name} must be a number in [-{limit}, {limit}]")


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    _check(lat1, lon1)
    _check(lat2, lon2)
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def geohash_encode(lat: float, lon: float, precision: int = 9) -> str:
    """Standard geohash (longitude bit first; values >= the midpoint take the upper half)."""
    _check(lat, lon)
    if isinstance(precision, bool) or not isinstance(precision, int) or not 1 <= precision <= 12:
        raise ValueError("precision must be an integer from 1 to 12")
    ranges = [[-180.0, 180.0], [-90.0, 90.0]]
    values = (lon, lat)
    out, bits, char, even = [], 0, 0, True
    while len(out) < precision:
        r = ranges[0 if even else 1]
        mid = (r[0] + r[1]) / 2
        if values[0 if even else 1] >= mid:
            char, r[0] = char * 2 + 1, mid
        else:
            char, r[1] = char * 2, mid
        even, bits = not even, bits + 1
        if bits == 5:
            out.append(GEOHASH_ALPHABET[char])
            bits, char = 0, 0
    return "".join(out)


def geohash_decode(geohash: str) -> GeohashCell:
    """Cell center and half the cell size in degrees; raises ValueError for invalid input."""
    if not isinstance(geohash, str) or not 1 <= len(geohash) <= 12:
        raise ValueError("geohash must be 1 to 12 characters")
    lat_r, lon_r, even = [-90.0, 90.0], [-180.0, 180.0], True
    for c in geohash.lower():
        index = GEOHASH_ALPHABET.find(c)
        if index < 0:
            raise ValueError(f"invalid geohash character {c!r}")
        for shift in range(4, -1, -1):
            r = lon_r if even else lat_r
            mid = (r[0] + r[1]) / 2
            if (index >> shift) & 1:
                r[0] = mid
            else:
                r[1] = mid
            even = not even
    return GeohashCell((lat_r[0] + lat_r[1]) / 2, (lon_r[0] + lon_r[1]) / 2,
                       (lat_r[1] - lat_r[0]) / 2, (lon_r[1] - lon_r[0]) / 2)


def bounding_box(lat: float, lon: float, radius_meters: float) -> BoundingBox:
    """Box containing every point within radius_meters, clamped to valid coordinates.

    The longitude half-width is widened by 1/cos(lat) (solved exactly on the sphere) and
    becomes the full range when the circle reaches a pole. Boxes crossing the
    antimeridian are clamped to [-180, 180] rather than split.
    """
    _check(lat, lon)
    if isinstance(radius_meters, bool) or not isinstance(radius_meters, (int, float)) \
            or not 0 <= radius_meters < math.pi * EARTH_RADIUS_M:
        raise ValueError("radius_meters must be >= 0 and less than half the circumference")
    angular = radius_meters / EARTH_RADIUS_M
    d_lat = math.degrees(angular)
    min_lat, max_lat = lat - d_lat, lat + d_lat
    ratio = math.sin(angular / 2) / math.cos(math.radians(lat)) if abs(lat) < 90 else 2.0
    if min_lat <= -90 or max_lat >= 90 or ratio >= 1:
        min_lon, max_lon = -180.0, 180.0
    else:
        d_lon = math.degrees(2 * math.asin(ratio))
        min_lon, max_lon = max(-180.0, lon - d_lon), min(180.0, lon + d_lon)
    return BoundingBox(max(-90.0, min_lat), min_lon, min(90.0, max_lat), max_lon)
