// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * RFC 5545 recurrence rule expansion in UTC: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
 * BYDAY (with MONTHLY/YEARLY ordinals), BYMONTHDAY and BYMONTH. Matches python-dateutil for every rule it accepts;
 * rejects BYSETPOS, WKST, BYHOUR and every other part.
 */
public final class RRule {
    private static final Pattern DTSTART = Pattern.compile("([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z");
    private static final Pattern UNTIL = Pattern.compile("([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z");
    private static final Pattern SIGNED = Pattern.compile("[+-]?[0-9]{1,4}");
    private static final Pattern UNSIGNED = Pattern.compile("\\+?[0-9]{1,4}");
    private static final Pattern BYDAY = Pattern.compile("([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)");
    private static final List<String> WEEKDAYS = List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU");
    private static final Set<String> ALLOWED = Set.of("FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH");
    private static final int MAX_PERIODS = 100000;

    private RRule() {}

    /** byDay entries are {ordinal, weekday}: ordinal 0 means every such weekday; weekday 0 = Monday. */
    private record Rule(String freq, int interval, Integer count, LocalDateTime until, List<int[]> byDay, List<Integer> byMonthDay, List<Integer> byMonth) {}

    private static LocalDateTime dateTime(Matcher m, String what) {
        try {
            int year = Integer.parseInt(m.group(1));
            if (year < 1) throw new IllegalArgumentException(what + " year must be 0001-9999");
            return LocalDateTime.of(year, Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)),
                Integer.parseInt(m.group(4)), Integer.parseInt(m.group(5)), Integer.parseInt(m.group(6)));
        } catch (DateTimeException e) {
            throw new IllegalArgumentException("invalid " + what + ": " + e.getMessage(), e);
        }
    }

    private static int num(String s, int lo, int hi, boolean signed, String part) {
        if (!(signed ? SIGNED : UNSIGNED).matcher(s).matches()) throw new IllegalArgumentException("invalid " + part + " value: " + s);
        int v = Integer.parseInt(s);
        if (v == 0 || Math.abs(v) < lo || Math.abs(v) > hi) throw new IllegalArgumentException(part + " value out of range: " + s);
        return v;
    }

    private static Rule parseRule(String rule) {
        if (rule == null) throw new IllegalArgumentException("rule is required");
        Map<String, String> parts = new HashMap<>();
        for (String p : rule.split(";", -1)) {
            int eq = p.indexOf('=');
            if (eq < 0) throw new IllegalArgumentException("malformed rule part: " + p);
            String k = p.substring(0, eq);
            if (parts.containsKey(k)) throw new IllegalArgumentException("duplicate rule part: " + k);
            parts.put(k, p.substring(eq + 1));
        }
        for (String k : parts.keySet()) if (!ALLOWED.contains(k)) throw new IllegalArgumentException("unsupported rule part: " + k);
        String freq = parts.get("FREQ");
        if (freq == null) throw new IllegalArgumentException("FREQ is required");
        if (!List.of("DAILY", "WEEKLY", "MONTHLY", "YEARLY").contains(freq)) throw new IllegalArgumentException("unsupported FREQ: " + freq);
        if (parts.containsKey("COUNT") && parts.containsKey("UNTIL")) throw new IllegalArgumentException("COUNT and UNTIL cannot both be set");
        int interval = parts.containsKey("INTERVAL") ? num(parts.get("INTERVAL"), 1, 9999, false, "INTERVAL") : 1;
        Integer count = parts.containsKey("COUNT") ? num(parts.get("COUNT"), 1, 9999, false, "COUNT") : null;
        LocalDateTime until = null;
        if (parts.containsKey("UNTIL")) {
            Matcher m = UNTIL.matcher(parts.get("UNTIL"));
            if (!m.matches()) throw new IllegalArgumentException("UNTIL must be YYYYMMDDTHHMMSSZ");
            until = dateTime(m, "UNTIL");
        }
        List<int[]> byDay = new ArrayList<>();
        if (parts.containsKey("BYDAY")) {
            boolean ordinalScope = freq.equals("MONTHLY") || freq.equals("YEARLY");
            int maxOrdinal = freq.equals("MONTHLY") || (freq.equals("YEARLY") && parts.containsKey("BYMONTH")) ? 5 : 53;
            boolean plain = false, ordinal = false;
            for (String d : parts.get("BYDAY").split(",", -1)) {
                Matcher m = BYDAY.matcher(d);
                if (!m.matches()) throw new IllegalArgumentException("invalid BYDAY value: " + d);
                int n = 0;
                if (m.group(1) != null) {
                    n = Integer.parseInt(m.group(1));
                    if (!ordinalScope || n == 0 || Math.abs(n) > maxOrdinal) throw new IllegalArgumentException("invalid BYDAY ordinal for FREQ=" + freq + ": " + d);
                }
                if (n == 0) plain = true; else ordinal = true;
                byDay.add(new int[] {n, WEEKDAYS.indexOf(m.group(2))});
            }
            if (plain && ordinal) throw new IllegalArgumentException("BYDAY cannot mix plain and ordinal weekdays");
        }
        List<Integer> byMonthDay = new ArrayList<>();
        if (parts.containsKey("BYMONTHDAY")) {
            for (String x : parts.get("BYMONTHDAY").split(",", -1)) byMonthDay.add(num(x, 1, 31, true, "BYMONTHDAY"));
        }
        List<Integer> byMonth = new ArrayList<>();
        if (parts.containsKey("BYMONTH")) {
            for (String x : parts.get("BYMONTH").split(",", -1)) byMonth.add(num(x, 1, 12, false, "BYMONTH"));
        }
        return new Rule(freq, interval, count, until, byDay, byMonthDay, byMonth);
    }

    private static String format(LocalDateTime d) {
        return String.format(Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02dZ", d.getYear(), d.getMonthValue(), d.getDayOfMonth(), d.getHour(), d.getMinute(), d.getSecond());
    }

    /** Whether day d passes every filter; defaults (from dtstart) are already folded into the lists. */
    private static boolean matches(Rule r, List<int[]> byDay, List<Integer> byMonthDay, List<Integer> byMonth, LocalDate d) {
        if (!byMonth.isEmpty() && !byMonth.contains(d.getMonthValue())) return false;
        if (!byMonthDay.isEmpty()) {
            int nd = d.lengthOfMonth();
            boolean ok = false;
            for (int x : byMonthDay) if (d.getDayOfMonth() == (x > 0 ? x : nd + x + 1)) { ok = true; break; }
            if (!ok) return false;
        }
        if (!byDay.isEmpty()) {
            int wd = d.getDayOfWeek().getValue() - 1;
            boolean inMonth = r.freq().equals("MONTHLY") || (r.freq().equals("YEARLY") && !r.byMonth().isEmpty());
            boolean ok = false;
            for (int[] bd : byDay) {
                if (bd[1] != wd) continue;
                int n = bd[0];
                if (n == 0) { ok = true; break; }
                int pos = inMonth ? d.getDayOfMonth() : d.getDayOfYear();
                int len = inMonth ? d.lengthOfMonth() : d.lengthOfYear();
                int nth = n > 0 ? (pos - 1) / 7 + 1 : -((len - pos) / 7 + 1);
                if (nth == n) { ok = true; break; }
            }
            if (!ok) return false;
        }
        return true;
    }

    public static List<String> expandRRule(String dtstart, String rule) { return expandRRule(dtstart, rule, 50); }

    /** Occurrences (YYYY-MM-DDTHH:MM:SSZ) of rule starting at dtstart, at most limit (1..1000); scans at most 100000 periods. */
    public static List<String> expandRRule(String dtstart, String rule, int limit) {
        if (dtstart == null) throw new IllegalArgumentException("dtstart is required");
        Matcher dm = DTSTART.matcher(dtstart);
        if (!dm.matches()) throw new IllegalArgumentException("dtstart must be YYYY-MM-DDTHH:MM:SSZ");
        LocalDateTime s = dateTime(dm, "dtstart");
        Rule r = parseRule(rule);
        if (limit < 1 || limit > 1000) throw new IllegalArgumentException("limit must be between 1 and 1000");
        LocalTime t = s.toLocalTime();
        LocalDate start = s.toLocalDate();
        List<int[]> byDay = r.byDay();
        List<Integer> byMonthDay = r.byMonthDay();
        List<Integer> byMonth = r.byMonth();
        if (byDay.isEmpty() && byMonthDay.isEmpty()) {
            switch (r.freq()) {
                case "WEEKLY" -> byDay = List.<int[]>of(new int[] {0, start.getDayOfWeek().getValue() - 1});
                case "MONTHLY" -> byMonthDay = List.of(start.getDayOfMonth());
                case "YEARLY" -> {
                    byMonthDay = List.of(start.getDayOfMonth());
                    if (byMonth.isEmpty()) byMonth = List.of(start.getMonthValue());
                }
                default -> { }
            }
        }
        List<String> out = new ArrayList<>();
        for (int k = 0; k < MAX_PERIODS; k++) {
            long step = (long) k * r.interval();
            LocalDate first;
            int length;
            switch (r.freq()) {
                case "DAILY" -> { first = start.plusDays(step); length = 1; }
                case "WEEKLY" -> { first = start.minusDays(start.getDayOfWeek().getValue() - 1).plusWeeks(step); length = 7; }
                case "MONTHLY" -> {
                    long mi = start.getMonthValue() - 1 + step;
                    long y = start.getYear() + mi / 12;
                    if (y > 9999) return out;
                    first = LocalDate.of((int) y, (int) (mi % 12) + 1, 1);
                    length = first.lengthOfMonth();
                }
                default -> {
                    long y = start.getYear() + step;
                    if (y > 9999) return out;
                    first = LocalDate.of((int) y, 1, 1);
                    length = first.lengthOfYear();
                }
            }
            if (first.getYear() > 9999) return out;
            for (int i = 0; i < length; i++) {
                LocalDate d = first.plusDays(i);
                if (!matches(r, byDay, byMonthDay, byMonth, d)) continue;
                LocalDateTime c = LocalDateTime.of(d, t);
                if (c.getYear() > 9999) return out;
                if (c.isBefore(s)) continue;
                if (r.until() != null && c.isAfter(r.until())) return out;
                out.add(format(c));
                if ((r.count() != null && out.size() >= r.count()) || out.size() >= limit) return out;
            }
            if (r.until() != null && LocalDateTime.of(first, t).isAfter(r.until())) return out;
        }
        return out;
    }
}
