// SPDX-License-Identifier: Apache-2.0

/** Web Mercator (EPSG:3857) slippy-map tiles, Bing quadkeys and spherical Mercator meters. */
public final class TileMath {
    /** Latitude limit of the square Web Mercator world. */
    public static final double MAX_LAT = 85.05112877980659;
    /** WGS 84 semi-major axis used by EPSG:3857. */
    public static final double EARTH_RADIUS_M = 6378137.0;

    /** A tile address. */
    public record Tile(long x, long y, int zoom) {}

    private TileMath() {}

    private static long size(int zoom) {
        if (zoom < 0 || zoom > 24) throw new IllegalArgumentException("zoom must be between 0 and 24");
        return 1L << zoom;
    }

    private static void checkLonLat(double lon, double lat) {
        if (!(lon >= -180 && lon <= 180)) throw new IllegalArgumentException("longitude must be in [-180, 180]");
        if (!(lat >= -90 && lat <= 90)) throw new IllegalArgumentException("latitude must be in [-90, 90]");
    }

    private static void checkTile(long x, long y, long n) {
        if (x < 0 || x >= n || y < 0 || y >= n) throw new IllegalArgumentException("tile x and y must be in [0, 2^zoom - 1]");
    }

    /** The tile containing lon/lat at zoom (latitude clamped to +/-MAX_LAT). */
    public static Tile lonLatToTile(double lon, double lat, int zoom) {
        long n = size(zoom);
        checkLonLat(lon, lat);
        double r = Math.toRadians(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)));
        long x = (long) Math.floor((lon + 180) / 360 * n);
        long y = (long) Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
        return new Tile(Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1), zoom);
    }

    private static double tileLat(long y, long n) { return Math.toDegrees(Math.atan(Math.sinh(Math.PI * (1 - 2.0 * y / n)))); }

    /** {west, south, east, north} in degrees. */
    public static double[] tileBounds(long x, long y, int zoom) {
        long n = size(zoom);
        checkTile(x, y, n);
        return new double[] {(double) x / n * 360 - 180, tileLat(y + 1, n), (double) (x + 1) / n * 360 - 180, tileLat(y, n)};
    }

    /** Bing Maps quadkey of a tile ("" at zoom 0). */
    public static String tileToQuadkey(long x, long y, int zoom) {
        long n = size(zoom);
        checkTile(x, y, n);
        StringBuilder out = new StringBuilder(zoom);
        for (int i = zoom; i > 0; i--) {
            long m = 1L << (i - 1);
            out.append((char) ('0' + ((x & m) != 0 ? 1 : 0) + ((y & m) != 0 ? 2 : 0)));
        }
        return out.toString();
    }

    /** Tile of a quadkey of digits 0-3; the empty key is the zoom-0 tile. */
    public static Tile quadkeyToTile(String key) {
        if (key == null || key.length() > 24) throw new IllegalArgumentException("quadkey must be at most 24 characters");
        long x = 0;
        long y = 0;
        for (int i = 0; i < key.length(); i++) {
            char c = key.charAt(i);
            if (c < '0' || c > '3') throw new IllegalArgumentException("quadkey characters must be 0-3");
            int d = c - '0';
            x = (x << 1) | (d & 1);
            y = (y << 1) | (d >> 1);
        }
        return new Tile(x, y, key.length());
    }

    /** {x, y} spherical Mercator meters; rejects |lat| > MAX_LAT. */
    public static double[] lonLatToMercator(double lon, double lat) {
        if (!(lon >= -180 && lon <= 180)) throw new IllegalArgumentException("longitude must be in [-180, 180]");
        if (!(Math.abs(lat) <= MAX_LAT + 1e-9)) throw new IllegalArgumentException("latitude must be within +/-" + MAX_LAT);
        return new double[] {Math.toRadians(lon) * EARTH_RADIUS_M, Math.log(Math.tan(Math.PI / 4 + Math.toRadians(lat) / 2)) * EARTH_RADIUS_M};
    }
}
