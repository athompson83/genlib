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
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** RFC 5545 recurrence rule expansion (UTC subset: FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH). */
public final class RRule {
    private static final Pattern DTSTART = Pattern.compile("([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z");
    private static final Pattern UNTIL = Pattern.compile("([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z");
    private static final Pattern NUM = Pattern.compile("[+-]?[0-9]{1,4}");
    private static final Pattern BYDAY = Pattern.compile("([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)");
    private static final List<String> WEEKDAYS = List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU");
    private static final Set<String> ALLOWED = Set.of("FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH");
    private static final int MAX_PERIODS = 100000;

    private RRule() {}

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

    private static int num(String s, int lo, int hi, boolean allowNegative, String part) {
        if (!NUM.matcher(s).matches()) throw new IllegalArgumentException("invalid " + part + " value: " + s);
        int v = Integer.parseInt(s);
        if ((v < 0 && !allowNegative) || Math.abs(v) < lo || Math.abs(v) > hi) throw new IllegalArgumentException(part + " value out of range: " + s);
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
            for (String d : parts.get("BYDAY").split(",", -1)) {
                Matcher m = BYDAY.matcher(d);
                if (!m.matches()) throw new IllegalArgumentException("invalid BYDAY value: " + d);
                int n = m.group(1) == null ? 0 : Integer.parseInt(m.group(1));
                if (n != 0 && !freq.equals("MONTHLY")) throw new IllegalArgumentException("BYDAY ordinals are only supported with FREQ=MONTHLY");
                byDay.add(new int[] {n, WEEKDAYS.indexOf(m.group(2))});
            }
            if (freq.equals("DAILY") || freq.equals("YEARLY")) throw new IllegalArgumentException("BYDAY is not supported with FREQ=" + freq);
        }
        List<Integer> byMonthDay = new ArrayList<>();
        if (parts.containsKey("BYMONTHDAY")) {
            if (!freq.equals("MONTHLY")) throw new IllegalArgumentException("BYMONTHDAY requires FREQ=MONTHLY");
            for (String x : parts.get("BYMONTHDAY").split(",", -1)) byMonthDay.add(num(x, 1, 31, true, "BYMONTHDAY"));
            if (!byDay.isEmpty()) throw new IllegalArgumentException("BYDAY and BYMONTHDAY cannot be combined");
        }
        List<Integer> byMonth = new ArrayList<>();
        if (parts.containsKey("BYMONTH")) {
            if (!freq.equals("YEARLY")) throw new IllegalArgumentException("BYMONTH requires FREQ=YEARLY");
            for (String x : parts.get("BYMONTH").split(",", -1)) byMonth.add(num(x, 1, 12, false, "BYMONTH"));
        }
        return new Rule(freq, interval, count, until, byDay, byMonthDay, byMonth);
    }

    private static String format(LocalDateTime d) {
        return String.format(Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02dZ", d.getYear(), d.getMonthValue(), d.getDayOfMonth(), d.getHour(), d.getMinute(), d.getSecond());
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
        List<String> out = new ArrayList<>();
        for (int k = 0; k < MAX_PERIODS; k++) {
            TreeSet<LocalDateTime> cands = new TreeSet<>();
            long step = (long) k * r.interval();
            switch (r.freq()) {
                case "DAILY" -> cands.add(LocalDateTime.of(start.plusDays(step), t));
                case "WEEKLY" -> {
                    LocalDate monday = start.minusDays(start.getDayOfWeek().getValue() - 1).plusWeeks(step);
                    if (r.byDay().isEmpty()) cands.add(LocalDateTime.of(monday.plusDays(start.getDayOfWeek().getValue() - 1), t));
                    for (int[] d : r.byDay()) cands.add(LocalDateTime.of(monday.plusDays(d[1]), t));
                }
                case "MONTHLY" -> {
                    long mi = start.getMonthValue() - 1 + step;
                    long y = start.getYear() + mi / 12;
                    if (y > 9999) return out;
                    LocalDate first = LocalDate.of((int) y, (int) (mi % 12) + 1, 1);
                    int nd = first.lengthOfMonth();
                    if (!r.byDay().isEmpty()) {
                        for (int[] bd : r.byDay()) {
                            List<Integer> days = new ArrayList<>();
                            for (int d = 1; d <= nd; d++) if (first.withDayOfMonth(d).getDayOfWeek().getValue() - 1 == bd[1]) days.add(d);
                            int n = bd[0];
                            if (n == 0) for (int d : days) cands.add(LocalDateTime.of(first.withDayOfMonth(d), t));
                            else if (Math.abs(n) <= days.size()) cands.add(LocalDateTime.of(first.withDayOfMonth(days.get(n > 0 ? n - 1 : days.size() + n)), t));
                        }
                    } else if (!r.byMonthDay().isEmpty()) {
                        for (int md : r.byMonthDay()) {
                            int d = md > 0 ? md : nd + md + 1;
                            if (d >= 1 && d <= nd) cands.add(LocalDateTime.of(first.withDayOfMonth(d), t));
                        }
                    } else if (start.getDayOfMonth() <= nd) cands.add(LocalDateTime.of(first.withDayOfMonth(start.getDayOfMonth()), t));
                }
                default -> {
                    long y = start.getYear() + step;
                    if (y > 9999) return out;
                    List<Integer> months = r.byMonth().isEmpty() ? List.of(start.getMonthValue()) : r.byMonth();
                    for (int mo : months) {
                        LocalDate first = LocalDate.of((int) y, mo, 1);
                        if (start.getDayOfMonth() <= first.lengthOfMonth()) cands.add(LocalDateTime.of(first.withDayOfMonth(start.getDayOfMonth()), t));
                    }
                }
            }
            for (LocalDateTime c : cands) {
                if (c.getYear() > 9999) return out;
                if (c.isBefore(s)) continue;
                if (r.until() != null && c.isAfter(r.until())) return out;
                out.add(format(c));
                if ((r.count() != null && out.size() >= r.count()) || out.size() >= limit) return out;
            }
            if (r.until() != null && (cands.isEmpty() ? s : cands.first()).isAfter(r.until())) return out;
        }
        return out;
    }
}
