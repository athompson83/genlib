// SPDX-License-Identifier: Apache-2.0
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** ISO 8601 durations: PnYnMnWnDTnHnMn(.fff)S parsing, exact milliseconds and formatting. */
public final class IsoDuration {
    /** Parsed components; seconds and their fraction are combined into milliseconds. */
    public record Parts(long years, long months, long weeks, long days, long hours, long minutes, long milliseconds) {}

    private static final Pattern DURATION = Pattern.compile(
        "P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\\.([0-9]{1,3}))?S)?)?");

    private IsoDuration() {}

    private static long num(String g) {
        if (g == null) return 0;
        try { return Long.parseLong(g); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("duration component too large", e); }
    }

    /** Parses an upper-case ISO 8601 duration with at least one component; fractions only on seconds (1-3 digits). */
    public static Parts parseDuration(String s) {
        if (s == null) throw new IllegalArgumentException("duration is required");
        Matcher m = DURATION.matcher(s);
        if (!m.matches() || s.endsWith("T")) throw new IllegalArgumentException("invalid ISO 8601 duration: " + s);
        boolean any = false;
        for (int g = 1; g <= 7; g++) any |= m.group(g) != null;
        if (!any) throw new IllegalArgumentException("invalid ISO 8601 duration: " + s);
        String frac = m.group(8);
        long fracMs = frac == null ? 0 : Long.parseLong((frac + "00").substring(0, 3));
        long ms;
        try { ms = Math.addExact(Math.multiplyExact(num(m.group(7)), 1000L), fracMs); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("duration component too large", e); }
        return new Parts(num(m.group(1)), num(m.group(2)), num(m.group(3)), num(m.group(4)), num(m.group(5)), num(m.group(6)), ms);
    }

    /** Exact length in milliseconds (week = 7 days, day = 24 h); years and months are calendar-dependent and rejected. */
    public static long durationMilliseconds(Parts p) {
        if (p == null) throw new IllegalArgumentException("duration is required");
        if (p.years() != 0 || p.months() != 0) throw new IllegalArgumentException("years and months have no exact length");
        try {
            long days = Math.addExact(Math.multiplyExact(p.weeks(), 7L), p.days());
            long hours = Math.addExact(Math.multiplyExact(days, 24L), p.hours());
            long minutes = Math.addExact(Math.multiplyExact(hours, 60L), p.minutes());
            return Math.addExact(Math.multiplyExact(minutes, 60000L), p.milliseconds());
        } catch (ArithmeticException e) {
            throw new IllegalArgumentException("duration too large", e);
        }
    }

    /** Formats non-negative milliseconds as days, hours, minutes and seconds (0 -> "PT0S"). */
    public static String formatDuration(long ms) {
        if (ms < 0) throw new IllegalArgumentException("milliseconds must be >= 0");
        long d = ms / 86400000L;
        long r = ms % 86400000L;
        long h = r / 3600000L;
        r %= 3600000L;
        long mi = r / 60000L;
        r %= 60000L;
        long s = r / 1000L;
        long f = r % 1000L;
        StringBuilder out = new StringBuilder("P");
        if (d != 0) out.append(d).append('D');
        StringBuilder t = new StringBuilder();
        if (h != 0) t.append(h).append('H');
        if (mi != 0) t.append(mi).append('M');
        if (s != 0 || f != 0) {
            t.append(s);
            if (f != 0) {
                String frac = String.format(Locale.ROOT, "%03d", f);
                while (frac.endsWith("0")) frac = frac.substring(0, frac.length() - 1);
                t.append('.').append(frac);
            }
            t.append('S');
        }
        if (t.length() > 0) out.append('T').append(t);
        return out.length() == 1 ? "PT0S" : out.toString();
    }
}
