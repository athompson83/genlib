// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class DataUriTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    /** Equality plus identical toString, so map entry order is checked too. */
    private static void eqOrd(Object expected, Object actual, String name) {
        eq(expected, actual, name);
        eq(String.valueOf(expected), String.valueOf(actual), name + " (order)");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static java.util.LinkedHashMap<String, String> omap(String... kv) {
        java.util.LinkedHashMap<String, String> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static java.util.LinkedHashMap<String, Object> omapObj(Object... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    public static void main(String[] args) {
        { DataUri.Parsed p = DataUri.parseDataUri("data:,Hello%2C%20World!"); eq("text/plain", p.mime(), "parse 0 mime"); eqOrd(omap("charset", "US-ASCII"), p.params(), "parse 0 params"); eq(false, p.base64(), "parse 0 base64"); check(java.util.Arrays.equals(hex("48656c6c6f2c20576f726c6421"), p.data()), "parse 0 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=="); eq("text/plain", p.mime(), "parse 1 mime"); eqOrd(omap(), p.params(), "parse 1 params"); eq(true, p.base64(), "parse 1 base64"); check(java.util.Arrays.equals(hex("48656c6c6f2c20576f726c6421"), p.data()), "parse 1 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E"); eq("text/html", p.mime(), "parse 2 mime"); eqOrd(omap("charset", "utf-8"), p.params(), "parse 2 params"); eq(false, p.base64(), "parse 2 base64"); check(java.util.Arrays.equals(hex("3c68313e48693c2f68313e"), p.data()), "parse 2 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("DATA:image/png;BASE64,iVBORw0KGgo="); eq("image/png", p.mime(), "parse 3 mime"); eqOrd(omap(), p.params(), "parse 3 params"); eq(true, p.base64(), "parse 3 base64"); check(java.util.Arrays.equals(hex("89504e470d0a1a0a"), p.data()), "parse 3 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:;base64,SGk"); eq("text/plain", p.mime(), "parse 4 mime"); eqOrd(omap("charset", "US-ASCII"), p.params(), "parse 4 params"); eq(true, p.base64(), "parse 4 base64"); check(java.util.Arrays.equals(hex("4869"), p.data()), "parse 4 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:text/plain;charset=utf-8;foo=bar,x"); eq("text/plain", p.mime(), "parse 5 mime"); eqOrd(omap("charset", "utf-8", "foo", "bar"), p.params(), "parse 5 params"); eq(false, p.base64(), "parse 5 base64"); check(java.util.Arrays.equals(hex("78"), p.data()), "parse 5 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:application/json,%7B%22a%22%3A1%7D"); eq("application/json", p.mime(), "parse 6 mime"); eqOrd(omap(), p.params(), "parse 6 params"); eq(false, p.base64(), "parse 6 base64"); check(java.util.Arrays.equals(hex("7b2261223a317d"), p.data()), "parse 6 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:bogus,x"); eq("text/plain", p.mime(), "parse 7 mime"); eqOrd(omap("charset", "US-ASCII"), p.params(), "parse 7 params"); eq(false, p.base64(), "parse 7 base64"); check(java.util.Arrays.equals(hex("78"), p.data()), "parse 7 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:text/plain;base64,SG Vs\nbG8="); eq("text/plain", p.mime(), "parse 8 mime"); eqOrd(omap(), p.params(), "parse 8 params"); eq(true, p.base64(), "parse 8 base64"); check(java.util.Arrays.equals(hex("48656c6c6f"), p.data()), "parse 8 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:;charset=utf-8,%E2%82%AC"); eq("text/plain", p.mime(), "parse 9 mime"); eqOrd(omap("charset", "utf-8"), p.params(), "parse 9 params"); eq(false, p.base64(), "parse 9 base64"); check(java.util.Arrays.equals(hex("e282ac"), p.data()), "parse 9 data"); }
        { DataUri.Parsed p = DataUri.parseDataUri("data:,a%zzb"); eq("text/plain", p.mime(), "parse 10 mime"); eqOrd(omap("charset", "US-ASCII"), p.params(), "parse 10 params"); eq(false, p.base64(), "parse 10 base64"); check(java.util.Arrays.equals(hex("61257a7a62"), p.data()), "parse 10 data"); }
        eq("data:text/plain,Hello,%20World!", DataUri.buildDataUri(hex("48656c6c6f2c20576f726c6421"), "text/plain", null), "build 0");
        eq("data:image/png;base64,iVBORw0K", DataUri.buildDataUri(hex("89504e470d0a"), "image/png", null), "build 1");
        eq("data:application/json,%7B%22a%22:1%7D", DataUri.buildDataUri(hex("7b2261223a317d"), "application/json", null), "build 2");
        eq("data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC", DataUri.buildDataUri(hex("e282ac202620c3bc"), "text/plain;charset=utf-8", null), "build 3");
        eq("data:text/plain;base64,//4=", DataUri.buildDataUri(hex("fffe"), "text/plain", null), "build 4");
        eq("data:text/plain;base64,YWJj", DataUri.buildDataUri(hex("616263"), "text/plain", Boolean.TRUE), "build 5");
        eq("data:application/octet-stream;base64,", DataUri.buildDataUri(hex(""), "application/octet-stream", null), "build 6");
        eq("data:text/plain,a%20b/c?d", DataUri.buildDataUri(hex("6120622f633f64"), "text/plain", Boolean.FALSE), "build 7");
        throwsIae(() -> DataUri.parseDataUri("text/plain,x"), "invalid parse 0");
        throwsIae(() -> DataUri.parseDataUri("data:text/plain"), "invalid parse 1");
        throwsIae(() -> DataUri.parseDataUri("data:;base64,a"), "invalid parse 2");
        throwsIae(() -> DataUri.parseDataUri("data:;base64,@@@@"), "invalid parse 3");
        throwsIae(() -> DataUri.parseDataUri("data:;base64,SGVsbG8=x"), "invalid parse 4");
        throwsIae(() -> DataUri.buildDataUri(hex("00"), "not a type"), "invalid build 0");
        throwsIae(() -> DataUri.buildDataUri(hex("00"), "text/plain; charset"), "invalid build 1");
        eq("data:application/octet-stream;base64,AAE=", DataUri.buildDataUri(new byte[] {0, 1}), "build default");

        System.out.println("DataUriTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
