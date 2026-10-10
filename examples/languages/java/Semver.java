// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Strict SemVer 2.0.0 parsing and precedence, plus npm node-semver style range matching. */
public final class Semver {
    private static final String NUM = "0|[1-9][0-9]*";
    private static final String PRE_ID = "(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)";
    private static final String PRE = PRE_ID + "(?:[.]" + PRE_ID + ")*";
    private static final String BUILD = "[0-9a-zA-Z-]+(?:[.][0-9a-zA-Z-]+)*";
    private static final Pattern FULL =
        Pattern.compile("(" + NUM + ")[.](" + NUM + ")[.](" + NUM + ")(?:-(" + PRE + "))?(?:[+](" + BUILD + "))?");
    private static final String XPART = "(" + NUM + "|[xX*])";
    private static final Pattern PARTIAL = Pattern.compile(
        XPART + "(?:[.]" + XPART + "(?:[.]" + XPART + "(?:-(" + PRE + "))?(?:[+](" + BUILD + "))?)?)?");
    private static final Pattern OP = Pattern.compile("(\\^|~|>=|<=|>|<|=)?(.*)");
    private static final Pattern HYPHEN = Pattern.compile("(\\S+)\\s+-\\s+(\\S+)");
    private static final Pattern OP_SPACE = Pattern.compile("(>=|<=|>|<|=|\\^|~)\\s+");

    private Semver() {}

    /** A parsed version; build metadata is kept but ignored by compare. */
    public record Version(long major, long minor, long patch, List<String> prerelease, String build) {
        public Version {
            prerelease = List.copyOf(prerelease);
        }

        @Override
        public String toString() {
            String s = major + "." + minor + "." + patch;
            if (!prerelease.isEmpty()) s += "-" + String.join(".", prerelease);
            return build == null ? s : s + "+" + build;
        }
    }

    private static long num(String s) {
        try { return Long.parseLong(s); }
        catch (NumberFormatException e) { throw new IllegalArgumentException("version number too large: " + s); }
    }

    private static List<String> pre(String s) { return s == null ? List.of() : Arrays.asList(s.split("[.]")); }

    /** Parses a strict SemVer 2.0.0 version (no leading zeros, no "v" prefix, no surrounding spaces). */
    public static Version parse(String text) {
        if (text == null) throw new IllegalArgumentException("version is required");
        Matcher m = FULL.matcher(text);
        if (!m.matches()) throw new IllegalArgumentException("invalid semantic version: " + text);
        return new Version(num(m.group(1)), num(m.group(2)), num(m.group(3)), pre(m.group(4)), m.group(5));
    }

    private static boolean numeric(String id) { return id.chars().allMatch(c -> c >= '0' && c <= '9'); }

    private static int compareIds(String a, String b) {
        boolean na = numeric(a);
        boolean nb = numeric(b);
        if (na && nb) return a.length() != b.length() ? Integer.compare(a.length(), b.length()) : Integer.signum(a.compareTo(b));
        if (na) return -1;
        if (nb) return 1;
        return Integer.signum(a.compareTo(b));
    }

    /** SemVer precedence (section 11): -1, 0 or 1. Build metadata is ignored. */
    public static int compare(Version a, Version b) {
        int c = Long.compare(a.major(), b.major());
        if (c == 0) c = Long.compare(a.minor(), b.minor());
        if (c == 0) c = Long.compare(a.patch(), b.patch());
        if (c != 0) return Integer.signum(c);
        List<String> pa = a.prerelease();
        List<String> pb = b.prerelease();
        if (pa.isEmpty() || pb.isEmpty()) return Boolean.compare(pa.isEmpty(), pb.isEmpty());
        for (int i = 0; i < Math.min(pa.size(), pb.size()); i++) {
            int r = compareIds(pa.get(i), pb.get(i));
            if (r != 0) return r;
        }
        return Integer.compare(pa.size(), pb.size());
    }

    public static int compare(String a, String b) { return compare(parse(a), parse(b)); }

    /** One comparator; version == null means "matches anything". */
    private record Comparator(String op, Version version) {
        boolean test(Version v) {
            if (version == null) return true;
            int c = compare(v, version);
            return switch (op) {
                case "<" -> c < 0;
                case "<=" -> c <= 0;
                case ">" -> c > 0;
                case ">=" -> c >= 0;
                default -> c == 0;
            };
        }
    }

    private static final Comparator ANY = new Comparator("", null);
    private static final Comparator NONE = new Comparator("<", new Version(0, 0, 0, List.of("0"), null));

    private static boolean isX(String s) { return s == null || s.equals("x") || s.equals("X") || s.equals("*"); }

    private static long inc(long n) {
        try { return Math.addExact(n, 1); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("version number too large"); }
    }

    private static Version v(long ma, long mi, long pa, List<String> pre) { return new Version(ma, mi, pa, pre, null); }

    private static Version v0(long ma, long mi, long pa) { return v(ma, mi, pa, List.of("0")); }

    private static Matcher partial(String text) {
        Matcher m = PARTIAL.matcher(text);
        if (!m.matches()) throw new IllegalArgumentException("invalid version in range: " + text);
        return m;
    }

    private static void comparator(String token, List<Comparator> out) {
        Matcher om = OP.matcher(token);
        if (!om.matches()) throw new IllegalArgumentException("invalid comparator: " + token);
        String op = om.group(1) == null ? "" : om.group(1);
        Matcher m = partial(om.group(2));
        String sM = m.group(1);
        String sm = m.group(2);
        String sp = m.group(3);
        boolean xM = isX(sM);
        boolean xm = xM || isX(sm);
        boolean xp = xm || isX(sp);
        long ma = xM ? 0 : num(sM);
        long mi = xm ? 0 : num(sm);
        long pa = xp ? 0 : num(sp);
        List<String> pr = xp ? List.of() : pre(m.group(4));
        switch (op) {
            case "^" -> {
                if (xM) out.add(ANY);
                else if (xm) { out.add(new Comparator(">=", v(ma, 0, 0, List.of()))); out.add(new Comparator("<", v0(inc(ma), 0, 0))); }
                else if (xp) {
                    out.add(new Comparator(">=", v(ma, mi, 0, List.of())));
                    out.add(new Comparator("<", ma == 0 ? v0(0, inc(mi), 0) : v0(inc(ma), 0, 0)));
                } else {
                    out.add(new Comparator(">=", v(ma, mi, pa, pr)));
                    Version upper = ma != 0 ? v0(inc(ma), 0, 0) : mi != 0 ? v0(0, inc(mi), 0) : v0(0, 0, inc(pa));
                    out.add(new Comparator("<", upper));
                }
            }
            case "~" -> {
                if (xM) out.add(ANY);
                else if (xm) { out.add(new Comparator(">=", v(ma, 0, 0, List.of()))); out.add(new Comparator("<", v0(inc(ma), 0, 0))); }
                else {
                    out.add(new Comparator(">=", v(ma, mi, xp ? 0 : pa, pr)));
                    out.add(new Comparator("<", v0(ma, inc(mi), 0)));
                }
            }
            default -> {
                String g = op.equals("=") && xp ? "" : op;
                if (xM) out.add(g.equals("<") || g.equals(">") ? NONE : ANY);
                else if (!g.isEmpty() && xp) {
                    if (g.equals(">")) { g = ">="; if (xm) { ma = inc(ma); mi = 0; } else mi = inc(mi); }
                    else if (g.equals("<=")) { g = "<"; if (xm) ma = inc(ma); else mi = inc(mi); }
                    out.add(new Comparator(g, g.equals("<") ? v0(ma, mi, 0) : v(ma, mi, 0, List.of())));
                } else if (xm) { out.add(new Comparator(">=", v(ma, 0, 0, List.of()))); out.add(new Comparator("<", v0(inc(ma), 0, 0))); }
                else if (xp) { out.add(new Comparator(">=", v(ma, mi, 0, List.of()))); out.add(new Comparator("<", v0(ma, inc(mi), 0))); }
                else out.add(new Comparator(g.isEmpty() ? "=" : g, v(ma, mi, pa, pr)));
            }
        }
    }

    private static void hyphen(String from, String to, List<Comparator> out) {
        Matcher f = partial(from);
        Matcher t = partial(to);
        if (isX(f.group(1))) out.add(ANY);
        else if (isX(f.group(2))) out.add(new Comparator(">=", v(num(f.group(1)), 0, 0, List.of())));
        else if (isX(f.group(3))) out.add(new Comparator(">=", v(num(f.group(1)), num(f.group(2)), 0, List.of())));
        else out.add(new Comparator(">=", v(num(f.group(1)), num(f.group(2)), num(f.group(3)), pre(f.group(4)))));
        if (isX(t.group(1))) out.add(ANY);
        else if (isX(t.group(2))) out.add(new Comparator("<", v0(inc(num(t.group(1))), 0, 0)));
        else if (isX(t.group(3))) out.add(new Comparator("<", v0(num(t.group(1)), inc(num(t.group(2))), 0)));
        else out.add(new Comparator("<=", v(num(t.group(1)), num(t.group(2)), num(t.group(3)), pre(t.group(4)))));
    }

    private static List<Comparator> parseSet(String raw) {
        String set = raw.trim();
        List<Comparator> out = new ArrayList<>();
        Matcher h = HYPHEN.matcher(set);
        if (h.matches()) { hyphen(h.group(1), h.group(2), out); return out; }
        set = OP_SPACE.matcher(set).replaceAll("$1");
        if (set.isEmpty()) { out.add(ANY); return out; }
        for (String token : set.split("\\s+")) comparator(token, out);
        return out;
    }

    private static boolean testSet(List<Comparator> set, Version version) {
        for (Comparator c : set) if (!c.test(version)) return false;
        if (version.prerelease().isEmpty()) return true;
        // A prerelease only matches when a comparator in this set opts into the same major.minor.patch prerelease.
        // Synthetic "<X.Y.Z-0" upper bounds can never admit an X.Y.Z prerelease, so they never qualify here.
        for (Comparator c : set) {
            Version a = c.version();
            if (a == null || a.prerelease().isEmpty()) continue;
            if (a.major() == version.major() && a.minor() == version.minor() && a.patch() == version.patch()) return true;
        }
        return false;
    }

    /** True when version satisfies the npm-style range (|| sets of comparators, ^, ~, x-ranges, hyphen ranges). */
    public static boolean satisfies(String version, String range) {
        Version v = parse(version);
        if (range == null) throw new IllegalArgumentException("range is required");
        boolean any = false;
        for (String set : range.split("\\|\\|", -1)) if (testSet(parseSet(set), v)) any = true;
        return any;
    }
}
