# SPDX-License-Identifier: Apache-2.0
"""Web Mercator (EPSG:3857) slippy-map tile math: tiles, bounds, Bing quadkeys and meters."""
import math

MAX_LATITUDE = 85.05112877980659
EARTH_RADIUS_M = 6378137.0


def _zoom(zoom: int) -> int:
    if isinstance(zoom, bool) or not isinstance(zoom, int) or not 0 <= zoom <= 24:
        raise ValueError("zoom must be an integer from 0 to 24")
    return zoom


def _finite(*values: float) -> None:
    for v in values:
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError("coordinates must be finite numbers")


def _tile(x: int, y: int, zoom: int) -> int:
    n = 1 << _zoom(zoom)
    for v in (x, y):
        if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v < n:
            raise ValueError(f"tile x and y must be integers in [0, {n - 1}] at zoom {zoom}")
    return n


def lon_lat_to_tile(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    _finite(lon, lat)
    if not -180 <= lon <= 180:
        raise ValueError("longitude must be in [-180, 180]")
    n = 1 << _zoom(zoom)
    lat = max(-MAX_LATITUDE, min(MAX_LATITUDE, lat))
    r = math.radians(lat)
    x = math.floor((lon + 180) / 360 * n)
    y = math.floor((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def tile_bounds(x: int, y: int, zoom: int) -> list[float]:
    """[west, south, east, north] in degrees."""
    n = _tile(x, y, zoom)

    def lat(yy: int) -> float:
        return math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * yy / n))))

    return [x / n * 360 - 180, lat(y + 1), (x + 1) / n * 360 - 180, lat(y)]


def tile_to_quadkey(x: int, y: int, zoom: int) -> str:
    _tile(x, y, zoom)
    digits = []
    for i in range(zoom, 0, -1):
        mask = 1 << (i - 1)
        digits.append(str((1 if x & mask else 0) + (2 if y & mask else 0)))
    return "".join(digits)


def quadkey_to_tile(key: str) -> tuple[int, int, int]:
    """Returns (x, y, zoom); the empty key is the zoom 0 tile."""
    if not isinstance(key, str) or len(key) > 24:
        raise ValueError("quadkey must be a string of at most 24 digits")
    x = y = 0
    for ch in key:
        if ch not in "0123":
            raise ValueError(f"invalid quadkey character: {ch!r}")
        d = ord(ch) - 48
        x = (x << 1) | (d & 1)
        y = (y << 1) | (d >> 1)
    return x, y, len(key)


def lon_lat_to_mercator(lon: float, lat: float) -> list[float]:
    """[x, y] in EPSG:3857 meters."""
    _finite(lon, lat)
    if not -180 <= lon <= 180:
        raise ValueError("longitude must be in [-180, 180]")
    if abs(lat) > MAX_LATITUDE + 1e-9:
        raise ValueError("latitude must be within +/-85.05112877980659")
    return [math.radians(lon) * EARTH_RADIUS_M,
            math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * EARTH_RADIUS_M]
