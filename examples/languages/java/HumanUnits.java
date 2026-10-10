// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Byte sizes (SI and IEC), byte-size parsing, compact durations and relative times, with integer half-up rounding. */
public final class HumanUnits {
    private static final String[] SI = {"B", "kB", "MB", "GB", "TB", "PB", "EB"};
    private static final String[] IEC = {"B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"};
    private static final Pattern SIZE = Pattern.compile("\\s*([0-9]+)(?:\\.([0-9]+))?\\s*([A-Za-z]*)\\s*", Pattern.UNICODE_CHARACTER_CLASS);
    private static final Map<String, BigInteger> UNITS = Map.ofEntries(
        Map.entry("", BigInteger.ONE), Map.entry("b", BigInteger.ONE),
        Map.entry("kb", BigInteger.TEN.pow(3)), Map.entry("mb", BigInteger.TEN.pow(6)), Map.entry("gb", BigInteger.TEN.pow(9)),
        Map.entry("tb", BigInteger.TEN.pow(12)), Map.entry("pb", BigInteger.TEN.pow(15)), Map.entry("eb", BigInteger.TEN.pow(18)),
        Map.entry("kib", BigInteger.TWO.pow(10)), Map.entry("mib", BigInteger.TWO.pow(20)), Map.entry("gib", BigInteger.TWO.pow(30)),
        Map.entry("tib", BigInteger.TWO.pow(40)), Map.entry("pib", BigInteger.TWO.pow(50)), Map.entry("eib", BigInteger.TWO.pow(60)));
    private static final BigInteger MAX = BigInteger.valueOf(Long.MAX_VALUE);

    private HumanUnits() {}

    /** Round half up of n / d for n >= 0, d > 0. */
    private static BigInteger roundDiv(BigInteger n, BigInteger d) {
        return n.shiftLeft(1).add(d).divide(d.shiftLeft(1));
    }

    private static long roundDiv(long n, long d) {
        return n / d + (2 * (n % d) >= d ? 1 : 0);
    }

    public static String formatBytes(long n) { return formatBytes(n, "si", 1); }

    /** "1.5 kB" / "1.5 KiB"; base is "si" or "iec", decimals 0..3, trailing zeros removed. */
    public static String formatBytes(long n, String base, int decimals) {
        if (n < 0) throw new IllegalArgumentException("byte count must be non-negative");
        if (decimals < 0 || decimals > 3) throw new IllegalArgumentException("decimals must be 0..3");
        if (!"si".equals(base) && !"iec".equals(base)) throw new IllegalArgumentException("base must be si or iec");
        String[] units = "si".equals(base) ? SI : IEC;
        BigInteger step = BigInteger.valueOf("si".equals(base) ? 1000 : 1024);
        BigInteger big = BigInteger.valueOf(n);
        if (big.compareTo(step) < 0) return n + " B";
        int i = 1;
        while (i < 6 && big.compareTo(step.pow(i + 1)) >= 0) i++;
        BigInteger scale = BigInteger.TEN.pow(decimals);
        BigInteger v = roundDiv(big.multiply(scale), step.pow(i));
        if (v.compareTo(step.multiply(scale)) >= 0 && i < 6) { i++; v = roundDiv(big.multiply(scale), step.pow(i)); }
        BigInteger[] wf = v.divideAndRemainder(scale);
        String s = wf[0].toString();
        if (decimals > 0) {
            StringBuilder frac = new StringBuilder(wf[1].toString());
            while (frac.length() < decimals) frac.insert(0, '0');
            while (frac.length() > 0 && frac.charAt(frac.length() - 1) == '0') frac.setLength(frac.length() - 1);
            if (frac.length() > 0) s += "." + frac;
        }
        return s + " " + units[i];
    }

    /** Parses "1.5 GiB", "2MB", "512"; units are case-insensitive (kb..eb powers of 1000, kib..eib powers of 1024). */
    public static long parseBytes(String text) {
        Matcher m = SIZE.matcher(text);
        if (!m.matches()) throw new IllegalArgumentException("invalid byte size");
        BigInteger mult = UNITS.get(m.group(3).toLowerCase(Locale.ROOT));
        if (mult == null) throw new IllegalArgumentException("unknown byte unit");
        String frac = m.group(2) == null ? "" : m.group(2);
        BigInteger num = new BigInteger(m.group(1) + frac);
        BigInteger r = roundDiv(num.multiply(mult), BigInteger.TEN.pow(frac.length()));
        if (r.compareTo(MAX) > 0) throw new IllegalArgumentException("byte size exceeds 2^63-1");
        return r.longValueExact();
    }

    /** "850ms", "45s", "1h 2m", "1d 1h": the two largest non-zero units of whole seconds. */
    public static String formatDuration(long ms) {
        if (ms < 0) throw new IllegalArgumentException("duration must be non-negative");
        if (ms < 1000) return ms + "ms";
        long s = ms / 1000;
        String[] names = {"d", "h", "m", "s"};
        long[] sizes = {86400, 3600, 60, 1};
        StringBuilder out = new StringBuilder();
        int count = 0;
        for (int k = 0; k < 4 && count < 2; k++) {
            long q = s / sizes[k];
            s %= sizes[k];
            if (q > 0) {
                if (count > 0) out.append(' ');
                out.append(q).append(names[k]);
                count++;
            }
        }
        return out.toString();
    }

    /** "just now", "in 3 minutes", "2 months ago"; positive deltaSeconds is the future. */
    public static String relativeTime(long deltaSeconds) {
        if (deltaSeconds == Long.MIN_VALUE) throw new IllegalArgumentException("delta out of range");
        long a = Math.abs(deltaSeconds);
        String p;
        if (a < 45) return "just now";
        else if (a < 90) p = "a minute";
        else if (a < 45 * 60) p = roundDiv(a, 60) + " minutes";
        else if (a < 90 * 60) p = "an hour";
        else if (a < 22 * 3600) p = roundDiv(a, 3600) + " hours";
        else if (a < 36 * 3600) p = "a day";
        else if (a < 26 * 86400) p = roundDiv(a, 86400) + " days";
        else if (a < 46 * 86400) p = "a month";
        else if (a < 320 * 86400) p = roundDiv(a, 2629746) + " months";
        else if (a < 548 * 86400) p = "a year";
        else p = roundDiv(a, 31556952) + " years";
        return deltaSeconds > 0 ? "in " + p : p + " ago";
    }
}
