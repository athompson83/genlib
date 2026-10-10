// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Server-driven content negotiation: Accept (media types) and Accept-Language (RFC 9110, RFC 4647 basic filtering). */
public final class ContentNegotiation {
    private static final Pattern Q = Pattern.compile("0(\\.[0-9]{0,3})?|1(\\.0{0,3})?");
    private static final Pattern MEDIA_RANGE = Pattern.compile("[!#$%&'*+.^_`|~0-9a-z-]+/[!#$%&'*+.^_`|~0-9a-z-]+");
    private static final Pattern LANGUAGE_RANGE = Pattern.compile("\\*|[a-z]{1,8}(-[a-z0-9]{1,8})*");

    private ContentNegotiation() {}

    private record Item(String value, double q) {}

    private static String trim(String s) {
        int a = 0, b = s.length();
        while (a < b && (s.charAt(a) == ' ' || s.charAt(a) == '\t')) a++;
        while (b > a && (s.charAt(b - 1) == ' ' || s.charAt(b - 1) == '\t')) b--;
        return s.substring(a, b);
    }

    /** Items "value;params" with a valid q (default 1); values are lower-cased; invalid q or empty items are skipped. */
    private static List<Item> parse(String header) {
        List<Item> items = new ArrayList<>();
        for (String raw : header.split(",", -1)) {
            String part = trim(raw);
            if (part.isEmpty()) continue;
            String[] bits = part.split(";", -1);
            Double q = 1.0;
            for (int i = 1; i < bits.length && q != null; i++) {
                String bit = trim(bits[i]);
                int eq = bit.indexOf('=');
                String k = eq < 0 ? bit : bit.substring(0, eq);
                String v = eq < 0 ? "" : bit.substring(eq + 1);
                if (!k.strip().toLowerCase(Locale.ROOT).equals("q")) continue;
                v = v.strip();
                q = Q.matcher(v).matches() ? Double.valueOf(v) : null;
            }
            if (q != null) items.add(new Item(trim(bits[0]).toLowerCase(Locale.ROOT), q));
        }
        return items;
    }

    /** Best available media type for an Accept header (null or blank: first available); null when nothing is acceptable. */
    public static String negotiateMediaType(String accept, List<String> available) {
        if (available == null) throw new IllegalArgumentException("available is required");
        if (accept == null || accept.isBlank()) return available.isEmpty() ? null : available.get(0);
        List<Item> ranges = new ArrayList<>();
        for (Item it : parse(accept)) if (MEDIA_RANGE.matcher(it.value()).matches()) ranges.add(it);
        String best = null;
        double bestQ = 0.0;
        for (String a : available) {
            String[] ts = a.toLowerCase(Locale.ROOT).split("/", -1);
            if (ts.length != 2) throw new IllegalArgumentException("available media type must be type/subtype: " + a);
            int spec = 0;
            double q = 0;
            for (Item r : ranges) {
                String[] rs = r.value().split("/", -1);
                int s = rs[0].equals(ts[0]) && rs[1].equals(ts[1]) ? 3 : rs[0].equals(ts[0]) && rs[1].equals("*") ? 2 : rs[0].equals("*") && rs[1].equals("*") ? 1 : 0;
                if (s > spec) { spec = s; q = r.q(); }
            }
            if (spec > 0 && q > bestQ) { best = a; bestQ = q; }
        }
        return best;
    }

    /** Best available language tag (original case) for an Accept-Language header; null when nothing is acceptable. */
    public static String negotiateLanguage(String acceptLanguage, List<String> available) {
        if (available == null) throw new IllegalArgumentException("available is required");
        if (acceptLanguage == null || acceptLanguage.isBlank()) return available.isEmpty() ? null : available.get(0);
        List<Item> ranges = new ArrayList<>();
        for (Item it : parse(acceptLanguage)) if (LANGUAGE_RANGE.matcher(it.value()).matches()) ranges.add(it);
        String best = null;
        double bestQ = 0.0;
        for (String a : available) {
            String tag = a.toLowerCase(Locale.ROOT);
            int spec = 0;
            double q = 0;
            for (Item r : ranges) {
                int s = 0;
                if (r.value().equals("*")) s = 1;
                else if (tag.equals(r.value()) || tag.startsWith(r.value() + "-")) s = 2 + (int) r.value().chars().filter(c -> c == '-').count();
                if (s > spec) { spec = s; q = r.q(); }
            }
            if (spec > 0 && q > bestQ) { best = a; bestQ = q; }
        }
        return best;
    }
}
