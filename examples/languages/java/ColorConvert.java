// SPDX-License-Identifier: Apache-2.0

/**
 * Color conversions between CSS hex, sRGB, HSL and OKLCH (Ottosson's Oklab). Channels r, g, b, alpha are 0..1;
 * HSL h is degrees [0, 360), s and l 0..1; OKLCH L 0..1, C >= 0, h degrees.
 */
public final class ColorConvert {
    private ColorConvert() {}

    private static double pyMod(double a, double m) {
        double r = a % m;
        if (r != 0 && (r < 0) != (m < 0)) r += m;
        else if (r == 0) r = Math.copySign(0.0, m);
        return r;
    }

    /** "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) to {r, g, b, a} in 0..1. */
    public static double[] parseHex(String text) {
        if (text == null || !text.matches("#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})")) throw new IllegalArgumentException("expected #rgb, #rgba, #rrggbb or #rrggbbaa");
        String h = text.substring(1);
        if (h.length() <= 4) {
            StringBuilder sb = new StringBuilder();
            for (char c : h.toCharArray()) sb.append(c).append(c);
            h = sb.toString();
        }
        double[] out = {0, 0, 0, 1.0};
        for (int i = 0; i < h.length() / 2; i++) out[i] = Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16) / 255.0;
        return out;
    }

    private static int channel(double v) {
        return (int) Math.min(255, Math.max(0, Math.floor(Math.min(1, Math.max(0, v)) * 255 + 0.5)));
    }

    /** Lowercase #rrggbb, or #rrggbbaa when a < 1; channels clamped to 0..1 and rounded half up. */
    public static String toHex(double r, double g, double b, double a) {
        String out = String.format("#%02x%02x%02x", channel(r), channel(g), channel(b));
        if (a < 1) out += String.format("%02x", (int) Math.min(255, Math.max(0, Math.floor(Math.max(0, a) * 255 + 0.5))));
        return out;
    }

    /** Opaque toHex. */
    public static String toHex(double r, double g, double b) { return toHex(r, g, b, 1.0); }

    /** sRGB to {h, s, l}. */
    public static double[] rgbToHsl(double r, double g, double b) {
        double mx = Math.max(r, Math.max(g, b));
        double mn = Math.min(r, Math.min(g, b));
        double l = (mx + mn) / 2;
        double d = mx - mn;
        if (d == 0) return new double[] {0.0, 0.0, l};
        double s = d / (1 - Math.abs(2 * l - 1));
        double h;
        if (mx == r) h = pyMod((g - b) / d, 6);
        else if (mx == g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return new double[] {pyMod(h * 60, 360), s, l};
    }

    /** HSL (h wraps modulo 360) to {r, g, b}. */
    public static double[] hslToRgb(double h, double s, double l) {
        h = pyMod(h, 360);
        double c = (1 - Math.abs(2 * l - 1)) * s;
        double x = c * (1 - Math.abs(pyMod(h / 60, 2) - 1));
        double m = l - c / 2;
        int sector = Math.floorMod((int) Math.floor(h / 60), 6);
        double[][] t = {{c, x, 0}, {x, c, 0}, {0, c, x}, {0, x, c}, {x, 0, c}, {c, 0, x}};
        return new double[] {t[sector][0] + m, t[sector][1] + m, t[sector][2] + m};
    }

    private static double lin(double c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

    private static double gam(double c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

    private static double cbrt(double x) { return Math.copySign(Math.pow(Math.abs(x), 1.0 / 3), x); }

    /** sRGB to {L, C, h} in OKLCH. */
    public static double[] rgbToOklch(double r, double g, double b) {
        r = lin(r);
        g = lin(g);
        b = lin(b);
        double l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        double m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        double s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        double bigL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
        double bigA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        double bigB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        double c = Math.hypot(bigA, bigB);
        double h = c > 1e-7 ? pyMod(Math.toDegrees(Math.atan2(bigB, bigA)), 360) : 0.0;
        return new double[] {bigL, c, h};
    }

    /** OKLCH to sRGB {r, g, b}, not clamped (values outside 0..1 are out of the sRGB gamut). */
    public static double[] oklchToRgb(double bigL, double c, double h) {
        double a = c * Math.cos(Math.toRadians(h));
        double bb = c * Math.sin(Math.toRadians(h));
        double l = Math.pow(bigL + 0.3963377774 * a + 0.2158037573 * bb, 3);
        double m = Math.pow(bigL - 0.1055613458 * a - 0.0638541728 * bb, 3);
        double s = Math.pow(bigL - 0.0894841775 * a - 1.2914855480 * bb, 3);
        double r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
        double g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
        double b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
        return new double[] {gam(r), gam(g), gam(b)};
    }

    /** True when every channel is within [-eps, 1 + eps]. */
    public static boolean inGamut(double r, double g, double b, double eps) {
        return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
    }

    /** inGamut with eps 1e-9. */
    public static boolean inGamut(double r, double g, double b) { return inGamut(r, g, b, 1e-9); }
}
