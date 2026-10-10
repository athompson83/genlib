// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>Google encoded polyline algorithm (precision 5 by default, 6 for OSRM/Valhalla).</summary>
public static class Polyline {
    /// <summary>Encodes (lat, lon) points; throws <see cref="ArgumentOutOfRangeException"/> for a bad precision or coordinate.</summary>
    public static string EncodePolyline(IEnumerable<(double Lat, double Lon)> points, int precision = 5) {
        ArgumentNullException.ThrowIfNull(points);
        double factor = Factor(precision);
        var sb = new StringBuilder();
        long prevLat = 0, prevLon = 0;
        foreach (var (lat, lon) in points) {
            if (!(lat >= -90 && lat <= 90)) throw new ArgumentOutOfRangeException(nameof(points), "latitude must be in [-90, 90]");
            if (!(lon >= -180 && lon <= 180)) throw new ArgumentOutOfRangeException(nameof(points), "longitude must be in [-180, 180]");
            long iLat = Round(lat * factor), iLon = Round(lon * factor);
            Write(sb, iLat - prevLat);
            Write(sb, iLon - prevLon);
            prevLat = iLat; prevLon = iLon;
        }
        return sb.ToString();
    }

    /// <summary>Decodes <paramref name="text"/>; throws <see cref="FormatException"/> for characters outside 63..126 or truncated input.</summary>
    public static List<(double Lat, double Lon)> DecodePolyline(string text, int precision = 5) {
        ArgumentNullException.ThrowIfNull(text);
        double factor = Factor(precision);
        var points = new List<(double Lat, double Lon)>();
        int i = 0;
        long lat = 0, lon = 0;
        long Next() {
            long result = 0;
            int shift = 0;
            while (true) {
                if (i >= text.Length) throw new FormatException("truncated polyline");
                int c = text[i++] - 63;
                if (c < 0 || c > 63) throw new FormatException($"invalid polyline character at {i - 1}");
                if (shift > 60) throw new FormatException("polyline value too long");
                result |= (long)(c & 0x1f) << shift;
                shift += 5;
                if (c < 0x20) break;
            }
            return (result & 1) == 1 ? ~(result >> 1) : result >> 1;
        }
        while (i < text.Length) {
            lat += Next();
            if (i >= text.Length) throw new FormatException("truncated polyline: latitude without longitude");
            lon += Next();
            points.Add((lat / factor, lon / factor));
        }
        return points;
    }

    private static double Factor(int precision) {
        if (precision < 0 || precision > 10) throw new ArgumentOutOfRangeException(nameof(precision), "precision must be 0 to 10");
        long f = 1;
        for (int i = 0; i < precision; i++) f *= 10;
        return f;
    }

    private static long Round(double v) => v >= 0 ? (long)Math.Floor(v + 0.5) : -(long)Math.Floor(-v + 0.5);

    private static void Write(StringBuilder sb, long delta) {
        long v = delta < 0 ? ~(delta << 1) : delta << 1;
        while (v >= 0x20) { sb.Append((char)((0x20 | (v & 0x1f)) + 63)); v >>= 5; }
        sb.Append((char)(v + 63));
    }
}
