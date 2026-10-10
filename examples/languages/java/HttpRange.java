// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** RFC 9110 byte Range request parsing and Content-Range values. */
public final class HttpRange {
    private static final Pattern HEADER = Pattern.compile("[ \\t]*([A-Za-z]+)=(.*)");
    private static final Pattern SPEC = Pattern.compile("([0-9]+)-([0-9]*)|-([0-9]+)");
    private static final int MAX_SPECS = 100;

    private HttpRange() {}

    /** What to do with a request: NONE = serve 200 with the full body, UNSATISFIABLE = 416, RANGES = 206. */
    public enum Kind { NONE, UNSATISFIABLE, RANGES }

    /** An inclusive byte range. */
    public record ByteRange(long start, long end) {}

    /** Parse outcome; ranges are in header order (not merged), contentRange is set for UNSATISFIABLE. */
    public record Result(Kind kind, List<ByteRange> ranges, String contentRange) {
        static final Result NONE = new Result(Kind.NONE, List.of(), null);
    }

    private static String trim(String s) {
        int a = 0, b = s.length();
        while (a < b && (s.charAt(a) == ' ' || s.charAt(a) == '\t')) a++;
        while (b > a && (s.charAt(b - 1) == ' ' || s.charAt(b - 1) == '\t')) b--;
        return s.substring(a, b);
    }

    /** Parses a Range header (null when absent) for a representation of size bytes. */
    public static Result parseRange(String header, long size) {
        if (size < 0) throw new IllegalArgumentException("size must be non-negative");
        if (header == null) return Result.NONE;
        Matcher m = HEADER.matcher(header);
        if (!m.matches() || !m.group(1).toLowerCase(Locale.ROOT).equals("bytes")) return Result.NONE;
        String[] specs = m.group(2).split(",", -1);
        if (specs.length > MAX_SPECS) return Result.NONE;
        for (int i = 0; i < specs.length; i++) {
            specs[i] = trim(specs[i]);
            if (specs[i].isEmpty()) return Result.NONE;
        }
        BigInteger big = BigInteger.valueOf(size);
        List<ByteRange> out = new ArrayList<>();
        for (String p : specs) {
            Matcher mm = SPEC.matcher(p);
            if (!mm.matches()) return Result.NONE;
            if (mm.group(3) != null) {
                BigInteger n = new BigInteger(mm.group(3));
                if (n.signum() == 0 || size == 0) continue;
                long start = n.compareTo(big) >= 0 ? 0 : size - n.longValueExact();
                out.add(new ByteRange(start, size - 1));
            } else {
                BigInteger a = new BigInteger(mm.group(1));
                BigInteger b = mm.group(2).isEmpty() ? null : new BigInteger(mm.group(2));
                if (b != null && b.compareTo(a) < 0) return Result.NONE;
                if (a.compareTo(big) >= 0) continue;
                long end = b == null || b.compareTo(big) >= 0 ? size - 1 : b.longValueExact();
                out.add(new ByteRange(a.longValueExact(), end));
            }
        }
        if (out.isEmpty()) return new Result(Kind.UNSATISFIABLE, List.of(), "bytes */" + size);
        return new Result(Kind.RANGES, List.copyOf(out), null);
    }

    /** Content-Range value "bytes start-end/size" for a 206 response. */
    public static String contentRange(long start, long end, long size) {
        if (start < 0 || end < start || end >= size) throw new IllegalArgumentException("need 0 <= start <= end < size");
        return "bytes " + start + "-" + end + "/" + size;
    }
}
