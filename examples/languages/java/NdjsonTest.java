// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class NdjsonTest {
    private static final Object NULL = null;
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

    /** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
    private static void near(double expected, double actual, String name) {
        check(Math.abs(expected - actual) <= Math.max(1e-9 * Math.max(Math.abs(expected), Math.abs(actual)), 1e-12),
            name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static LinkedHashMap<String, Object> omap(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    public static void main(String[] args) {
        eqOrd(lst(omap("a", 1L), omap("b", lst(1L, 2L))), Ndjson.parseNdjson("{\"a\":1}\n{\"b\":[1,2]}\n"), "parse 0");
        eqOrd(lst(1L, "x", true, NULL), Ndjson.parseNdjson("\n  \n1\r\n\"x\"\ntrue\nnull\n"), "parse 1");
        eqOrd(lst(), Ndjson.parseNdjson(""), "parse 2");
        eqOrd(lst(omap("k", "caf\u00e9")), Ndjson.parseNdjson("{\"k\":\"caf\u00e9\"}"), "parse 3");
        throwsMsg(() -> Ndjson.parseNdjson("{\"a\":1}\n{bad}\n"), "line 2", "invalid parse 0");
        throwsMsg(() -> Ndjson.parseNdjson("1 2"), "line 1", "invalid parse 1");
        throwsMsg(() -> Ndjson.parseNdjson("{\"a\":1}\n\n[1,"), "line 3", "invalid parse 2");
        eq("{\"a\":1,\"b\":[true,null,\"x\"]}\n", Ndjson.stringifyNdjson(lst(omap("a", 1L, "b", lst(true, NULL, "x")))), "stringify 0");
        eqOrd(lst(omap("a", 1L, "b", lst(true, NULL, "x"))), Ndjson.parseNdjson("{\"a\":1,\"b\":[true,null,\"x\"]}\n"), "stringify round trip 0");
        eq("1\n\"two\"\nfalse\n", Ndjson.stringifyNdjson(lst(1L, "two", false)), "stringify 1");
        eqOrd(lst(1L, "two", false), Ndjson.parseNdjson("1\n\"two\"\nfalse\n"), "stringify round trip 1");
        eq("", Ndjson.stringifyNdjson(lst()), "stringify 2");
        eqOrd(lst(), Ndjson.parseNdjson(""), "stringify round trip 2");
        eq("{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u00e9\"}\n", Ndjson.stringifyNdjson(lst(omap("q", "say \"hi\"\\ \n\t\u0001 caf\u00e9"))), "stringify 3");
        eqOrd(lst(omap("q", "say \"hi\"\\ \n\t\u0001 caf\u00e9")), Ndjson.parseNdjson("{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u00e9\"}\n"), "stringify round trip 3");
        eq("{\"z\":1,\"a\":2}\n", Ndjson.stringifyNdjson(lst(omap("z", 1L, "a", 2L))), "stringify 4");
        eqOrd(lst(omap("z", 1L, "a", 2L)), Ndjson.parseNdjson("{\"z\":1,\"a\":2}\n"), "stringify round trip 4");
        eq("[]\n{}\n", Ndjson.stringifyNdjson(lst(lst(), omap())), "stringify 5");
        eqOrd(lst(lst(), omap()), Ndjson.parseNdjson("[]\n{}\n"), "stringify round trip 5");
        eq("-42\n0\n", Ndjson.stringifyNdjson(lst(-42L, 0L)), "stringify 6");
        eqOrd(lst(-42L, 0L), Ndjson.parseNdjson("-42\n0\n"), "stringify round trip 6");

        System.out.println("NdjsonTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
