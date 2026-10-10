// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.RoundingMode;

/** WCAG 2.x relative luminance, contrast ratio and AA/AAA pass checks for #rgb / #rrggbb colors. */
public final class WcagContrast {
    private WcagContrast() {}

    private static int hexDigit(char c) {
        int d = Character.digit(c, 16);
        if (d < 0 || c > 'f') throw new IllegalArgumentException("color must be #rgb or #rrggbb");
        return d;
    }

    private static double channel(int value) {
        double c = value / 255.0;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /** WCAG relative luminance in [0, 1] of a #rgb or #rrggbb color (case-insensitive). */
    public static double relativeLuminance(String hex) {
        if (hex == null || hex.isEmpty() || hex.charAt(0) != '#' || (hex.length() != 4 && hex.length() != 7))
            throw new IllegalArgumentException("color must be #rgb or #rrggbb");
        int[] rgb = new int[3];
        for (int i = 0; i < 3; i++) {
            if (hex.length() == 4) { int d = hexDigit(hex.charAt(1 + i)); rgb[i] = d * 17; }
            else rgb[i] = hexDigit(hex.charAt(1 + 2 * i)) * 16 + hexDigit(hex.charAt(2 + 2 * i));
        }
        return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    }

    /** (Lmax + 0.05) / (Lmin + 0.05), between 1 and 21. */
    public static double contrastRatio(String a, String b) {
        double la = relativeLuminance(a);
        double lb = relativeLuminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    }

    /** contrastRatio rounded to 2 decimals, half away from zero. */
    public static double contrastRatio2(String a, String b) {
        return new BigDecimal(contrastRatio(a, b)).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    /** AA needs 4.5 (3.0 large text), AAA needs 7.0 (4.5 large text); compares the unrounded ratio. */
    public static boolean passes(double ratio, String level, boolean largeText) {
        if ("AA".equals(level)) return ratio >= (largeText ? 3.0 : 4.5);
        if ("AAA".equals(level)) return ratio >= (largeText ? 4.5 : 7.0);
        throw new IllegalArgumentException("level must be AA or AAA");
    }
}
