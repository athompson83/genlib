// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>A decoded geohash cell: its center and the half-size of the cell in each axis.</summary>
public readonly record struct GeohashCell(double Lat, double Lon, double LatError, double LonError);

/// <summary>A latitude/longitude box (clamped to valid ranges; it does not wrap across the antimeridian).</summary>
public readonly record struct GeoBox(double MinLat, double MinLon, double MaxLat, double MaxLon);

/// <summary>Great-circle distance, geohash encoding/decoding and radius bounding boxes.</summary>
public static class Geo {
    /// <summary>Mean Earth radius in meters (IUGG).</summary>
    public const double EarthRadiusMeters = 6371008.8;
    private const string Base32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    /// <summary>Haversine distance in meters between two points in degrees.</summary>
    public static double HaversineMeters(double lat1, double lon1, double lat2, double lon2) {
        CheckPoint(lat1, lon1); CheckPoint(lat2, lon2);
        double p1 = Rad(lat1), p2 = Rad(lat2), dp = Rad(lat2 - lat1), dl = Rad(lon2 - lon1);
        double a = Math.Sin(dp / 2) * Math.Sin(dp / 2) + Math.Cos(p1) * Math.Cos(p2) * Math.Sin(dl / 2) * Math.Sin(dl / 2);
        return 2 * EarthRadiusMeters * Math.Atan2(Math.Sqrt(a), Math.Sqrt(Math.Max(0, 1 - a)));
    }

    /// <summary>Standard geohash of 1 to 12 characters (longitude bit first).</summary>
    public static string GeohashEncode(double lat, double lon, int precision) {
        CheckPoint(lat, lon);
        if (precision < 1 || precision > 12) throw new ArgumentOutOfRangeException(nameof(precision), "precision must be 1 to 12");
        double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
        var chars = new char[precision];
        bool lonBit = true;
        for (int i = 0; i < precision; i++) {
            int idx = 0;
            for (int b = 0; b < 5; b++, lonBit = !lonBit) {
                if (lonBit) { double mid = (lonLo + lonHi) / 2; if (lon >= mid) { idx = idx * 2 + 1; lonLo = mid; } else { idx *= 2; lonHi = mid; } }
                else { double mid = (latLo + latHi) / 2; if (lat >= mid) { idx = idx * 2 + 1; latLo = mid; } else { idx *= 2; latHi = mid; } }
            }
            chars[i] = Base32[idx];
        }
        return new string(chars);
    }

    /// <summary>Decodes a 1-12 character geohash (case-insensitive) to its cell center and error; throws <see cref="FormatException"/> when invalid.</summary>
    public static GeohashCell GeohashDecode(string hash) {
        ArgumentNullException.ThrowIfNull(hash);
        if (hash.Length < 1 || hash.Length > 12) throw new FormatException("geohash must be 1 to 12 characters");
        double latLo = -90, latHi = 90, lonLo = -180, lonHi = 180;
        bool lonBit = true;
        foreach (char ch in hash) {
            int idx = Base32.IndexOf(char.ToLowerInvariant(ch));
            if (idx < 0) throw new FormatException($"invalid geohash character '{ch}'");
            for (int b = 4; b >= 0; b--, lonBit = !lonBit) {
                bool upper = ((idx >> b) & 1) == 1;
                if (lonBit) { double mid = (lonLo + lonHi) / 2; if (upper) lonLo = mid; else lonHi = mid; }
                else { double mid = (latLo + latHi) / 2; if (upper) latLo = mid; else latHi = mid; }
            }
        }
        return new GeohashCell((latLo + latHi) / 2, (lonLo + lonHi) / 2, (latHi - latLo) / 2, (lonHi - lonLo) / 2);
    }

    /// <summary>A box containing every point within <paramref name="radiusMeters"/> of the center.</summary>
    public static GeoBox BoundingBox(double lat, double lon, double radiusMeters) {
        CheckPoint(lat, lon);
        if (!double.IsFinite(radiusMeters) || radiusMeters < 0) throw new ArgumentOutOfRangeException(nameof(radiusMeters), "radiusMeters must be finite and >= 0");
        double angular = radiusMeters / EarthRadiusMeters;
        double dLat = Deg(angular);
        double minLat = Math.Max(-90, lat - dLat), maxLat = Math.Min(90, lat + dLat);
        // Exact longitude half-width so the point due east/west on the same parallel is exactly radiusMeters away.
        double s = Math.Sin(angular / 2) / Math.Cos(Rad(lat));
        if (maxLat >= 90 || minLat <= -90 || angular >= Math.PI || s >= 1) return new GeoBox(minLat, -180, maxLat, 180);
        double dLon = Deg(2 * Math.Asin(s));
        return new GeoBox(minLat, Math.Max(-180, lon - dLon), maxLat, Math.Min(180, lon + dLon));
    }

    private static double Rad(double d) => d * Math.PI / 180;
    private static double Deg(double r) => r * 180 / Math.PI;

    private static void CheckPoint(double lat, double lon) {
        if (!(lat >= -90 && lat <= 90)) throw new ArgumentOutOfRangeException(nameof(lat), "latitude must be in [-90, 90]");
        if (!(lon >= -180 && lon <= 180)) throw new ArgumentOutOfRangeException(nameof(lon), "longitude must be in [-180, 180]");
    }
}
