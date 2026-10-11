// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class DottedPathTest {
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

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static LinkedHashMap<String, String> omap(String... kv) {
        LinkedHashMap<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static LinkedHashMap<String, Object> omapObj(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static LinkedHashMap<String, LinkedHashMap<String, String>> iniData(Object... kv) {
        LinkedHashMap<String, LinkedHashMap<String, String>> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (LinkedHashMap<String, String>) kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    private static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xFF));
        return sb.toString();
    }

    /** Deterministic test byte source that cycles through the given bytes (passgen_ref.byte_source). */
    private static IntSupplier bytes(String h) {
        byte[] b = hex(h);
        int[] i = {0};
        return () -> b[i[0]++ % b.length] & 0xFF;
    }

    public static void main(String[] args) {
        Object data = omapObj("user", omapObj("name", "Ada", "tags", lst("a", "b"), "addr", lst(omapObj("city", "Paris"), omapObj("city", "Rome")), "x.y", omapObj("z", 1L)), "n", 0L, "nil", NULL);
        Object pristine = omapObj("user", omapObj("name", "Ada", "tags", lst("a", "b"), "addr", lst(omapObj("city", "Paris"), omapObj("city", "Rome")), "x.y", omapObj("z", 1L)), "n", 0L, "nil", NULL);
        eq(List.<Object>of(), DottedPath.parsePath(""), "parse 0");
        eq(List.<Object>of("a"), DottedPath.parsePath("a"), "parse 1");
        eq(List.<Object>of("a", "b", "c"), DottedPath.parsePath("a.b.c"), "parse 2");
        eq(List.<Object>of("a", 0), DottedPath.parsePath("a[0]"), "parse 3");
        eq(List.<Object>of("a", 0, 1, "b"), DottedPath.parsePath("a[0][1].b"), "parse 4");
        eq(List.<Object>of("x.y", "z"), DottedPath.parsePath("[\"x.y\"].z"), "parse 5");
        eq(List.<Object>of("user", "x.y", "z"), DottedPath.parsePath("user[\"x.y\"].z"), "parse 6");
        eq(List.<Object>of("a", "q\"t"), DottedPath.parsePath("a[\"q\\\"t\"]"), "parse 7");
        eq("Ada", DottedPath.getPath(data, "user.name", "DEF"), "get 0");
        eq("b", DottedPath.getPath(data, "user.tags[1]", "DEF"), "get 1");
        eq("Rome", DottedPath.getPath(data, "user.addr[1].city", "DEF"), "get 2");
        eq(1L, DottedPath.getPath(data, "user[\"x.y\"].z", "DEF"), "get 3");
        eq("DEF", DottedPath.getPath(data, "user.missing", "DEF"), "get 4");
        eq("DEF", DottedPath.getPath(data, "user.tags[5]", "DEF"), "get 5");
        eq("DEF", DottedPath.getPath(data, "user.name.first", "DEF"), "get 6");
        eq(0L, DottedPath.getPath(data, "n", "DEF"), "get 7");
        eq(NULL, DottedPath.getPath(data, "nil", "DEF"), "get 8");
        eq(omapObj("user", omapObj("name", "Ada", "tags", lst("a", "b"), "addr", lst(omapObj("city", "Paris"), omapObj("city", "Rome")), "x.y", omapObj("z", 1L)), "n", 0L, "nil", NULL), DottedPath.getPath(data, "", "DEF"), "get 9");
        eq("DEF", DottedPath.getPath(data, "user.tags.0", "DEF"), "get 10");
        eq(true, DottedPath.hasPath(data, "user.name"), "has 0");
        eq(true, DottedPath.hasPath(data, "nil"), "has 1");
        eq(false, DottedPath.hasPath(data, "user.nope"), "has 2");
        eq(false, DottedPath.hasPath(data, "user.tags[2]"), "has 3");
        Object set0 = omapObj();
        eqOrd(omapObj("a", omapObj("b", 1L)), DottedPath.setPath(set0, "a.b", 1L), "set 0");
        eq(omapObj(), set0, "set 0 input unchanged");
        Object set1 = omapObj();
        eqOrd(omapObj("a", lst(omapObj("b", 1L))), DottedPath.setPath(set1, "a[0].b", 1L), "set 1");
        eq(omapObj(), set1, "set 1 input unchanged");
        Object set2 = omapObj("a", lst(1L));
        eqOrd(omapObj("a", lst(1L, 2L)), DottedPath.setPath(set2, "a[1]", 2L), "set 2");
        eq(omapObj("a", lst(1L)), set2, "set 2 input unchanged");
        Object set3 = omapObj("a", omapObj("b", 1L));
        eqOrd(omapObj("a", omapObj("b", 1L, "c", lst(1L, 2L))), DottedPath.setPath(set3, "a.c", lst(1L, 2L)), "set 3");
        eq(omapObj("a", omapObj("b", 1L)), set3, "set 3 input unchanged");
        Object set4 = NULL;
        eqOrd(omapObj("x", true), DottedPath.setPath(set4, "x", true), "set 4");
        eq(NULL, set4, "set 4 input unchanged");
        Object set5 = omapObj("a", 1L);
        eqOrd(omapObj("z", 2L), DottedPath.setPath(set5, "", omapObj("z", 2L)), "set 5");
        eq(omapObj("a", 1L), set5, "set 5 input unchanged");
        Object set6 = omapObj();
        eqOrd(omapObj("k.v", 3L), DottedPath.setPath(set6, "[\"k.v\"]", 3L), "set 6");
        eq(omapObj(), set6, "set 6 input unchanged");
        throwsIae(() -> DottedPath.setPath(omapObj("a", lst(1L)), "a[3]", 0L), "invalid set 0");
        throwsIae(() -> DottedPath.setPath(omapObj("a", 1L), "a.b", 0L), "invalid set 1");
        throwsIae(() -> DottedPath.setPath(omapObj("a", omapObj()), "a[0]", 0L), "invalid set 2");
        Object del0 = omapObj("a", omapObj("b", 1L, "c", 2L));
        eqOrd(omapObj("a", omapObj("c", 2L)), DottedPath.deletePath(del0, "a.b"), "delete 0");
        eq(omapObj("a", omapObj("b", 1L, "c", 2L)), del0, "delete 0 input unchanged");
        Object del1 = omapObj("a", lst(1L, 2L, 3L));
        eqOrd(omapObj("a", lst(2L, 3L)), DottedPath.deletePath(del1, "a[0]"), "delete 1");
        eq(omapObj("a", lst(1L, 2L, 3L)), del1, "delete 1 input unchanged");
        Object del2 = omapObj("a", 1L);
        eqOrd(omapObj("a", 1L), DottedPath.deletePath(del2, "b"), "delete 2");
        eq(omapObj("a", 1L), del2, "delete 2 input unchanged");
        Object del3 = omapObj("a", lst(1L));
        eqOrd(omapObj("a", lst(1L)), DottedPath.deletePath(del3, "a[4]"), "delete 3");
        eq(omapObj("a", lst(1L)), del3, "delete 3 input unchanged");
        throwsIae(() -> DottedPath.parsePath("a."), "invalid parse 0");
        throwsIae(() -> DottedPath.parsePath(".a"), "invalid parse 1");
        throwsIae(() -> DottedPath.parsePath("a..b"), "invalid parse 2");
        throwsIae(() -> DottedPath.parsePath("a[01]"), "invalid parse 3");
        throwsIae(() -> DottedPath.parsePath("a[x]"), "invalid parse 4");
        throwsIae(() -> DottedPath.parsePath("a[\"x"), "invalid parse 5");
        throwsIae(() -> DottedPath.parsePath("a[1"), "invalid parse 6");
        throwsIae(() -> DottedPath.parsePath("a[-1]"), "invalid parse 7");
        eq(pristine, data, "data never mutated");
        eq("Ada", DottedPath.getPath(data, "user.name"), "default overload");

        System.out.println("DottedPathTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
