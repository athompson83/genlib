// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>Web Mercator (EPSG:3857) slippy-map tiles, Bing quadkeys and spherical Mercator meters.</summary>
public static class TileMath {
    /// <summary>Latitude limit of the square Web Mercator world, in degrees.</summary>
    public const double MaxLatitude = 85.05112877980659;
    /// <summary>Spherical Mercator radius in meters (WGS 84 semi-major axis).</summary>
    public const double RadiusMeters = 6378137.0;

    /// <summary>The tile containing (lon, lat) at zoom 0..24 (latitude is clamped to the Mercator limit).</summary>
    public static (int X, int Y) LonLatToTile(double lon, double lat, int zoom) {
        CheckZoom(zoom);
        if (!(lon >= -180 && lon <= 180)) throw new ArgumentOutOfRangeException(nameof(lon), "longitude must be in [-180, 180]");
        if (!(lat >= -90 && lat <= 90)) throw new ArgumentOutOfRangeException(nameof(lat), "latitude must be in [-90, 90]");
        int n = 1 << zoom;
        double r = Math.Clamp(lat, -MaxLatitude, MaxLatitude) * Math.PI / 180;
        double x = Math.Floor((lon + 180) / 360 * n);
        double y = Math.Floor((1 - Math.Log(Math.Tan(r) + 1 / Math.Cos(r)) / Math.PI) / 2 * n);
        return ((int)Math.Clamp(x, 0, n - 1), (int)Math.Clamp(y, 0, n - 1));
    }

    /// <summary>The tile's west, south, east and north edges in degrees.</summary>
    public static (double West, double South, double East, double North) TileBounds(int x, int y, int zoom) {
        CheckTile(x, y, zoom);
        double n = 1 << zoom;
        double Lon(int xx) => xx / n * 360 - 180;
        double Lat(int yy) => Math.Atan(Math.Sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
        return (Lon(x), Lat(y + 1), Lon(x + 1), Lat(y));
    }

    /// <summary>Bing Maps quadkey for a tile ("" at zoom 0).</summary>
    public static string TileToQuadkey(int x, int y, int zoom) {
        CheckTile(x, y, zoom);
        var chars = new char[zoom];
        for (int i = zoom; i > 0; i--) {
            int mask = 1 << (i - 1);
            chars[zoom - i] = (char)('0' + ((x & mask) != 0 ? 1 : 0) + ((y & mask) != 0 ? 2 : 0));
        }
        return new string(chars);
    }

    /// <summary>The tile named by a quadkey of digits 0-3 (at most 24); throws <see cref="FormatException"/> when invalid.</summary>
    public static (int X, int Y, int Zoom) QuadkeyToTile(string key) {
        ArgumentNullException.ThrowIfNull(key);
        if (key.Length > 24) throw new FormatException("quadkey longer than 24 digits");
        int x = 0, y = 0;
        foreach (char ch in key) {
            int d = ch - '0';
            if (d < 0 || d > 3) throw new FormatException($"quadkey digits must be 0-3, got '{ch}'");
            x = (x << 1) | (d & 1);
            y = (y << 1) | (d >> 1);
        }
        return (x, y, key.Length);
    }

    /// <summary>Spherical Mercator x and y in meters; throws beyond the Mercator latitude limit.</summary>
    public static (double X, double Y) LonLatToMercator(double lon, double lat) {
        if (!(lon >= -180 && lon <= 180)) throw new ArgumentOutOfRangeException(nameof(lon), "longitude must be in [-180, 180]");
        if (!(Math.Abs(lat) <= MaxLatitude + 1e-9)) throw new ArgumentOutOfRangeException(nameof(lat), "latitude must be within the Mercator limit");
        double r = lat * Math.PI / 180;
        return (lon * Math.PI / 180 * RadiusMeters, Math.Log(Math.Tan(Math.PI / 4 + r / 2)) * RadiusMeters);
    }

    private static void CheckZoom(int zoom) {
        if (zoom < 0 || zoom > 24) throw new ArgumentOutOfRangeException(nameof(zoom), "zoom must be 0 to 24");
    }

    private static void CheckTile(int x, int y, int zoom) {
        CheckZoom(zoom);
        int max = (1 << zoom) - 1;
        if (x < 0 || x > max) throw new ArgumentOutOfRangeException(nameof(x), $"x must be in [0, {max}]");
        if (y < 0 || y > max) throw new ArgumentOutOfRangeException(nameof(y), $"y must be in [0, {max}]");
    }
}
