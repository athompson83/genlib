// SPDX-License-Identifier: Apache-2.0
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

/** Next run time of a 5-field cron expression in UTC (Vixie day-of-month/day-of-week OR rule). */
public final class CronNext {
    private CronNext() {}

    private static int number(String s, String field) {
        if (s.isEmpty() || s.length() > 4 || !s.chars().allMatch(c -> c >= '0' && c <= '9'))
            throw new IllegalArgumentException("invalid " + field + " value: '" + s + "'");
        return Integer.parseInt(s);
    }

    private static boolean[] field(String text, String name, int min, int max) {
        boolean[] allowed = new boolean[max + 1];
        for (String item : text.split(",", -1)) {
            String range = item;
            int step = 1;
            int slash = item.indexOf('/');
            if (slash >= 0) {
                range = item.substring(0, slash);
                step = number(item.substring(slash + 1), name + " step");
                if (step < 1 || step > max - min + 1) throw new IllegalArgumentException(name + " step out of range: " + step);
            }
            int lo;
            int hi;
            if (range.equals("*")) { lo = min; hi = max; }
            else {
                int dash = range.indexOf('-');
                if (dash >= 0) { lo = number(range.substring(0, dash), name); hi = number(range.substring(dash + 1), name); }
                else { lo = number(range, name); hi = slash >= 0 ? max : lo; }
                if (lo < min || hi > max || lo > hi) throw new IllegalArgumentException(name + " out of range: '" + item + "'");
            }
            for (int v = lo; v <= hi; v += step) allowed[v] = true;
        }
        return allowed;
    }

    /** First minute strictly after afterIsoUtc (seconds truncated), formatted YYYY-MM-DDTHH:MM:00Z. */
    public static String nextRun(String expression, String afterIsoUtc) {
        if (expression == null) throw new IllegalArgumentException("expression is required");
        String[] f = expression.trim().split("\\s+");
        if (f.length != 5) throw new IllegalArgumentException("cron expression must have 5 fields");
        boolean[] minutes = field(f[0], "minute", 0, 59);
        boolean[] hours = field(f[1], "hour", 0, 23);
        boolean[] dom = field(f[2], "day-of-month", 1, 31);
        boolean[] months = field(f[3], "month", 1, 12);
        boolean[] dow = field(f[4], "day-of-week", 0, 7);
        if (dow[7]) dow[0] = true;
        boolean domRestricted = !f[2].startsWith("*");
        boolean dowRestricted = !f[4].startsWith("*");
        LocalDateTime t;
        try { t = LocalDateTime.ofInstant(Instant.parse(afterIsoUtc), ZoneOffset.UTC); }
        catch (DateTimeParseException | NullPointerException e) { throw new IllegalArgumentException("after must be an ISO-8601 UTC instant"); }
        t = t.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1);
        LocalDateTime limit = t.plusYears(5);
        while (!t.isAfter(limit)) {
            if (!months[t.getMonthValue()]) { t = t.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS).plusMonths(1); continue; }
            boolean domOk = dom[t.getDayOfMonth()];
            boolean dowOk = dow[t.getDayOfWeek().getValue() % 7];
            boolean dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk;
            if (!dayOk) { t = t.truncatedTo(ChronoUnit.DAYS).plusDays(1); continue; }
            if (!hours[t.getHour()]) { t = t.truncatedTo(ChronoUnit.HOURS).plusHours(1); continue; }
            if (!minutes[t.getMinute()]) { t = t.plusMinutes(1); continue; }
            return String.format("%04d-%02d-%02dT%02d:%02d:00Z", t.getYear(), t.getMonthValue(), t.getDayOfMonth(), t.getHour(), t.getMinute());
        }
        throw new IllegalArgumentException("no matching time within 5 years: " + expression);
    }
}
