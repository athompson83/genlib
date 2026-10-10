// SPDX-License-Identifier: Apache-2.0
import java.util.List;

/** Wave 6 vectors (shared with every Genlib language) for http-range. */
public final class HttpRangeTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(0L, 499L)), null), HttpRange.parseRange("bytes=0-499", 10000L), "range " + "bytes=0-499");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(500L, 999L)), null), HttpRange.parseRange("bytes=500-999", 10000L), "range " + "bytes=500-999");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(9500L, 9999L)), null), HttpRange.parseRange("bytes=-500", 10000L), "range " + "bytes=-500");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(9500L, 9999L)), null), HttpRange.parseRange("bytes=9500-", 10000L), "range " + "bytes=9500-");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(0L, 0L), new HttpRange.ByteRange(9999L, 9999L)), null), HttpRange.parseRange("bytes=0-0,-1", 10000L), "range " + "bytes=0-0,-1");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(0L, 1L), new HttpRange.ByteRange(5L, 6L)), null), HttpRange.parseRange("bytes= 0-1 , 5-6", 10000L), "range " + "bytes= 0-1 , 5-6");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(0L, 99L)), null), HttpRange.parseRange("BYTES=0-99", 10000L), "range " + "BYTES=0-99");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(9999L, 9999L)), null), HttpRange.parseRange("bytes=9999-20000", 10000L), "range " + "bytes=9999-20000");
        eq(new HttpRange.Result(HttpRange.Kind.UNSATISFIABLE, List.of(), "bytes */10000"), HttpRange.parseRange("bytes=10000-", 10000L), "range " + "bytes=10000-");
        eq(new HttpRange.Result(HttpRange.Kind.UNSATISFIABLE, List.of(), "bytes */10000"), HttpRange.parseRange("bytes=-0", 10000L), "range " + "bytes=-0");
        eq(new HttpRange.Result(HttpRange.Kind.RANGES, List.of(new HttpRange.ByteRange(0L, 9999L)), null), HttpRange.parseRange("bytes=-20000", 10000L), "range " + "bytes=-20000");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("bytes=500-400", 10000L), "range " + "bytes=500-400");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("items=0-1", 10000L), "range " + "items=0-1");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("bytes=", 10000L), "range " + "bytes=");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("bytes=0-1,", 10000L), "range " + "bytes=0-1,");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("bytes=abc", 10000L), "range " + "bytes=abc");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange("bytes=1-2-3", 10000L), "range " + "bytes=1-2-3");
        eq(new HttpRange.Result(HttpRange.Kind.NONE, List.of(), null), HttpRange.parseRange(null, 10000L), "range " + null);
        eq(new HttpRange.Result(HttpRange.Kind.UNSATISFIABLE, List.of(), "bytes */10000"), HttpRange.parseRange("bytes=10000-10001,20000-", 10000L), "range " + "bytes=10000-10001,20000-");
        eq(new HttpRange.Result(HttpRange.Kind.UNSATISFIABLE, List.of(), "bytes */0"), HttpRange.parseRange("bytes=0-", 0L), "empty file " + "bytes=0-");
        eq(new HttpRange.Result(HttpRange.Kind.UNSATISFIABLE, List.of(), "bytes */0"), HttpRange.parseRange("bytes=-5", 0L), "empty file " + "bytes=-5");
        eq("bytes 0-499/10000", HttpRange.contentRange(0L, 499L, 10000L), "content range");
        String many = "bytes=" + "0-0,".repeat(100) + "1-1";
        eq(HttpRange.Kind.NONE, HttpRange.parseRange(many, 10L).kind(), "more than 100 specs");
        eq(HttpRange.Kind.RANGES, HttpRange.parseRange("bytes=0-99999999999999999999999", 6000000000L).kind(), "huge end clamps");
        eq(5999999999L, HttpRange.parseRange("bytes=0-99999999999999999999999", 6000000000L).ranges().get(0).end(), "64-bit size");

        System.out.println("HttpRangeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
