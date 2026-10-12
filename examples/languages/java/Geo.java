// SPDX-License-Identifier: Apache-2.0
import java.util.Locale;

/** Great-circle distance (haversine), geohash encode/decode and a radius bounding box. */
public final class Geo {
    /** Mean Earth radius in meters (IUGG). */
    public static final double EARTH_RADIUS_M = 6371008.8;
    private static final String BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

    private Geo() {}

    /** A decoded geohash cell: center plus half the cell size in each axis. */
    public record Cell(double lat, double lon, double latError, double lonError) {}

    /** Bounding box in degrees. */
    public record Box(double minLat, double minLon, double maxLat, double maxLon) {}

    private static void checkPoint(double lat, double lon) {
        if (!(lat >= -90 && lat <= 90)) throw new IllegalArgumentException("latitude must be in [-90, 90]");
        if (!(lon >= -180 && lon <= 180)) throw new IllegalArgumentException("longitude must be in [-180, 180]");
    }

    /** Haversine distance in meters on a sphere of radius EARTH_RADIUS_M. */
    public static double haversineMeters(double lat1, double lon1, double lat2, double lon2) {
        checkPoint(lat1, lon1);
        checkPoint(lat2, lon2);
        double p1 = Math.toRadians(lat1);
        double p2 = Math.toRadians(lat2);
        double dp = Math.toRadians(lat2 - lat1);
        double dl = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        a = Math.min(1.0, a);
        return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /** Standard geohash (longitude bit first) of the given precision, 1 to 12 characters. */
    public static String geohashEncode(double lat, double lon, int precision) {
        checkPoint(lat, lon);
        if (precision < 1 || precision > 12) throw new IllegalArgumentException("precision must be between 1 and 12");
        double[] la = {-90, 90};
        double[] lo = {-180, 180};
        StringBuilder out = new StringBuilder(precision);
        boolean even = true;
        int bits = 0;
        int ch = 0;
        while (out.length() < precision) {
            double[] r = even ? lo : la;
            double value = even ? lon : lat;
            double mid = (r[0] + r[1]) / 2;
            if (value >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
            even = !even;
            if (++bits == 5) { out.append(BASE32.charAt(ch)); bits = 0; ch = 0; }
        }
        return out.toString();
    }

    /** Decodes a geohash (case-insensitive) to its cell center and half-size errors. */
    public static Cell geohashDecode(String hash) {
        if (hash == null || hash.isEmpty() || hash.length() > 12) throw new IllegalArgumentException("geohash must be 1 to 12 characters");
        String h = hash.toLowerCase(Locale.ROOT);
        double[] la = {-90, 90};
        double[] lo = {-180, 180};
        boolean even = true;
        for (int i = 0; i < h.length(); i++) {
            int v = BASE32.indexOf(h.charAt(i));
            if (v < 0) throw new IllegalArgumentException("invalid geohash character: '" + hash.charAt(i) + "'");
            for (int b = 4; b >= 0; b--) {
                double[] r = even ? lo : la;
                double mid = (r[0] + r[1]) / 2;
                if (((v >> b) & 1) == 1) r[0] = mid; else r[1] = mid;
                even = !even;
            }
        }
        return new Cell((la[0] + la[1]) / 2, (lo[0] + lo[1]) / 2, (la[1] - la[0]) / 2, (lo[1] - lo[0]) / 2);
    }

    /**
     * Box containing every point within radiusMeters of the center. Latitude is clamped to [-90, 90]; the longitude
     * half-width is the circle's widest longitude extent asin(sin(d)/cos(lat)) (about d/cos(lat)), and the full
     * [-180, 180] range is used near the poles, when sin(d) >= cos(lat), or when the box would cross the antimeridian,
     * so points on the far side of +-180 are never excluded.
     */
    public static Box boundingBox(double lat, double lon, double radiusMeters) {
        checkPoint(lat, lon);
        if (!(radiusMeters >= 0) || Double.isInfinite(radiusMeters)) throw new IllegalArgumentException("radiusMeters must be a finite number >= 0");
        double d = radiusMeters / EARTH_RADIUS_M;
        double dLat = Math.toDegrees(d);
        double minLat = Math.max(-90, lat - dLat);
        double maxLat = Math.min(90, lat + dLat);
        double s = Math.sin(d) / Math.cos(Math.toRadians(lat));
        if (minLat <= -90 || maxLat >= 90 || !(s < 1)) return new Box(minLat, -180, maxLat, 180);
        double dLon = Math.toDegrees(Math.asin(s));
        if (lon - dLon < -180 || lon + dLon > 180) return new Box(minLat, -180, maxLat, 180);
        return new Box(minLat, lon - dLon, maxLat, lon + dLon);
    }
}
