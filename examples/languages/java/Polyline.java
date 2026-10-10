// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;

/** Google encoded polyline algorithm; points are {lat, lon} pairs. */
public final class Polyline {
    private static final double MAX_SCALED = 9007199254740992.0; // 2^53

    private Polyline() {}

    private static long factor(int precision) {
        if (precision < 0 || precision > 10) throw new IllegalArgumentException("precision must be between 0 and 10");
        long f = 1;
        for (int i = 0; i < precision; i++) f *= 10;
        return f;
    }

    private static long round(double v) {
        if (!Double.isFinite(v) || Math.abs(v) > MAX_SCALED) throw new IllegalArgumentException("coordinate must be finite and in range");
        long r = (long) Math.floor(Math.abs(v) + 0.5);
        return v >= 0 ? r : -r;
    }

    private static void emit(StringBuilder out, long d) {
        long v = d < 0 ? ~(d << 1) : d << 1;
        while (v >= 0x20) { out.append((char) ((0x20 | (v & 0x1f)) + 63)); v >>>= 5; }
        out.append((char) (v + 63));
    }

    public static String encodePolyline(double[][] points) { return encodePolyline(points, 5); }

    /** Encodes {lat, lon} points, rounding half away from zero at the given precision (0..10). */
    public static String encodePolyline(double[][] points, int precision) {
        if (points == null) throw new IllegalArgumentException("points are required");
        long f = factor(precision);
        StringBuilder out = new StringBuilder();
        long plat = 0;
        long plon = 0;
        for (double[] p : points) {
            if (p == null || p.length != 2) throw new IllegalArgumentException("each point must be {lat, lon}");
            long lat = round(p[0] * f);
            long lon = round(p[1] * f);
            emit(out, lat - plat);
            emit(out, lon - plon);
            plat = lat;
            plon = lon;
        }
        return out.toString();
    }

    public static List<double[]> decodePolyline(String text) { return decodePolyline(text, 5); }

    /** Decodes an encoded polyline; rejects characters outside 63..126 and truncated input. */
    public static List<double[]> decodePolyline(String text, int precision) {
        if (text == null) throw new IllegalArgumentException("text is required");
        double f = factor(precision);
        List<double[]> out = new ArrayList<>();
        int[] pos = {0};
        long lat = 0;
        long lon = 0;
        while (pos[0] < text.length()) {
            lat += next(text, pos);
            if (pos[0] >= text.length()) throw new IllegalArgumentException("truncated polyline");
            lon += next(text, pos);
            out.add(new double[] {lat / f, lon / f});
        }
        return out;
    }

    private static long next(String text, int[] pos) {
        long result = 0;
        int shift = 0;
        while (true) {
            if (pos[0] >= text.length()) throw new IllegalArgumentException("truncated polyline");
            char c = text.charAt(pos[0]++);
            if (c < 63 || c > 126) throw new IllegalArgumentException("invalid polyline character at " + (pos[0] - 1));
            if (shift > 60) throw new IllegalArgumentException("polyline value too large");
            long b = c - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
            if (b < 0x20) break;
        }
        return (result & 1) != 0 ? ~(result >>> 1) : result >>> 1;
    }
}
