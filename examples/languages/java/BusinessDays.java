// SPDX-License-Identifier: Apache-2.0

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Business days over strict ISO dates (YYYY-MM-DD) with configurable weekend days (MO..SU) and holidays. */
public final class BusinessDays {
    private BusinessDays() {}

    private static final List<String> WEEKDAYS = List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU");
    private static final List<String> DEFAULT_WEEKEND = List.of("SA", "SU");

    private static LocalDate date(String s) {
        if (s == null || !s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException("date must be YYYY-MM-DD");
        int y = Integer.parseInt(s.substring(0, 4));
        if (y < 1) throw new IllegalArgumentException("year must be 0001..9999");
        try { return LocalDate.of(y, Integer.parseInt(s.substring(5, 7)), Integer.parseInt(s.substring(8, 10))); }
        catch (DateTimeException e) { throw new IllegalArgumentException("invalid date: " + s); }
    }

    private static Set<Integer> weekend(List<String> weekend) {
        Set<Integer> w = new HashSet<>();
        for (String x : weekend) {
            int i = WEEKDAYS.indexOf(x);
            if (i < 0) throw new IllegalArgumentException("weekend days are MO..SU");
            w.add(i);
        }
        if (w.size() == 7) throw new IllegalArgumentException("weekend cannot be every day");
        return w;
    }

    private static Set<LocalDate> holidays(List<String> holidays) {
        Set<LocalDate> h = new HashSet<>();
        for (String x : holidays) h.add(date(x));
        return h;
    }

    private static int wd(LocalDate d) { return d.getDayOfWeek().getValue() - 1; }

    private static LocalDate step(LocalDate d, int days) {
        LocalDate n = d.plusDays(days);
        if (n.getYear() < 1 || n.getYear() > 9999) throw new IllegalArgumentException("date out of range");
        return n;
    }

    /** True when date is neither a weekend day nor a holiday. */
    public static boolean isBusinessDay(String date, List<String> holidays, List<String> weekend) {
        Set<Integer> w = weekend(weekend);
        Set<LocalDate> h = holidays(holidays);
        LocalDate d = date(date);
        return !w.contains(wd(d)) && !h.contains(d);
    }

    /** isBusinessDay with no holidays and a Saturday/Sunday weekend. */
    public static boolean isBusinessDay(String date) { return isBusinessDay(date, List.of(), DEFAULT_WEEKEND); }

    /** The date n business days after date (before it when n < 0); n = 0 gives date or the next business day; |n| <= 100000. */
    public static String addBusinessDays(String date, int n, List<String> holidays, List<String> weekend) {
        if (Math.abs((long) n) > 100000) throw new IllegalArgumentException("n must be within +-100000");
        Set<Integer> w = weekend(weekend);
        Set<LocalDate> h = holidays(holidays);
        LocalDate d = date(date);
        if (n == 0) {
            while (w.contains(wd(d)) || h.contains(d)) d = step(d, 1);
            return d.toString();
        }
        int dir = n > 0 ? 1 : -1;
        int left = Math.abs(n);
        while (left > 0) {
            d = step(d, dir);
            if (!w.contains(wd(d)) && !h.contains(d)) left--;
        }
        return d.toString();
    }

    /** addBusinessDays with no holidays and a Saturday/Sunday weekend. */
    public static String addBusinessDays(String date, int n) { return addBusinessDays(date, n, List.of(), DEFAULT_WEEKEND); }

    /** Business days in [start, end) (start counted, end not); negative when end is before start. */
    public static long businessDaysBetween(String start, String end, List<String> holidays, List<String> weekend) {
        Set<Integer> w = weekend(weekend);
        Set<LocalDate> h = holidays(holidays);
        LocalDate a = date(start);
        LocalDate b = date(end);
        int sign = 1;
        if (b.isBefore(a)) { LocalDate t = a; a = b; b = t; sign = -1; }
        long days = b.toEpochDay() - a.toEpochDay();
        long full = days / 7;
        long rem = days % 7;
        long count = full * (7 - w.size());
        for (long i = 0; i < rem; i++) if (!w.contains(wd(a.plusDays(full * 7 + i)))) count++;
        for (LocalDate x : h) if (!x.isBefore(a) && x.isBefore(b) && !w.contains(wd(x))) count--;
        return sign * count;
    }

    /** businessDaysBetween with no holidays and a Saturday/Sunday weekend. */
    public static long businessDaysBetween(String start, String end) { return businessDaysBetween(start, end, List.of(), DEFAULT_WEEKEND); }
}
