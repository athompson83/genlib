// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class TopoSortTest {
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
        eq(List.<String>of("b", "c", "a", "d"), TopoSort.topoSort(List.<String>of("a", "b", "c", "d"), List.<List<String>>of(List.<String>of("c", "a"), List.<String>of("a", "d"))), "sort 0");
        eq(List.<String>of("x"), TopoSort.topoSort(List.<String>of("x"), List.<List<String>>of()), "sort 1");
        eq(List.<String>of("a", "b", "c"), TopoSort.topoSort(List.<String>of("a", "b", "c"), List.<List<String>>of()), "sort 2");
        eq(List.<String>of("shirt", "tie", "trousers", "belt", "jacket", "socks", "shoes", "watch"), TopoSort.topoSort(List.<String>of("shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"), List.<List<String>>of(List.<String>of("shirt", "tie"), List.<String>of("tie", "jacket"), List.<String>of("shirt", "belt"), List.<String>of("belt", "jacket"), List.<String>of("trousers", "belt"), List.<String>of("trousers", "shoes"), List.<String>of("socks", "shoes"))), "sort 3");
        eq(List.<String>of("a", "b"), TopoSort.topoSort(List.<String>of("a", "b"), List.<List<String>>of(List.<String>of("a", "b"), List.<String>of("a", "b"))), "sort 4");
        eq(List.<List<String>>of(List.<String>of("b", "c"), List.<String>of("a"), List.<String>of("d")), TopoSort.topoLevels(List.<String>of("a", "b", "c", "d"), List.<List<String>>of(List.<String>of("c", "a"), List.<String>of("a", "d"))), "levels 0");
        eq(List.<List<String>>of(List.<String>of("x")), TopoSort.topoLevels(List.<String>of("x"), List.<List<String>>of()), "levels 1");
        eq(List.<List<String>>of(List.<String>of("a", "b", "c")), TopoSort.topoLevels(List.<String>of("a", "b", "c"), List.<List<String>>of()), "levels 2");
        eq(List.<List<String>>of(List.<String>of("shirt", "trousers", "socks", "watch"), List.<String>of("tie", "belt", "shoes"), List.<String>of("jacket")), TopoSort.topoLevels(List.<String>of("shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"), List.<List<String>>of(List.<String>of("shirt", "tie"), List.<String>of("tie", "jacket"), List.<String>of("shirt", "belt"), List.<String>of("belt", "jacket"), List.<String>of("trousers", "belt"), List.<String>of("trousers", "shoes"), List.<String>of("socks", "shoes"))), "levels 3");
        eq(List.<List<String>>of(List.<String>of("a"), List.<String>of("b")), TopoSort.topoLevels(List.<String>of("a", "b"), List.<List<String>>of(List.<String>of("a", "b"), List.<String>of("a", "b"))), "levels 4");
        try { TopoSort.topoSort(List.<String>of("a", "b", "c"), List.<List<String>>of(List.<String>of("a", "b"), List.<String>of("b", "c"), List.<String>of("c", "b"))); check(false, "cycle 0 topoSort did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: b -> c -> b", e.getMessage(), "cycle 0 topoSort"); }
        try { TopoSort.topoLevels(List.<String>of("a", "b", "c"), List.<List<String>>of(List.<String>of("a", "b"), List.<String>of("b", "c"), List.<String>of("c", "b"))); check(false, "cycle 0 topoLevels did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: b -> c -> b", e.getMessage(), "cycle 0 topoLevels"); }
        try { TopoSort.topoSort(List.<String>of("a"), List.<List<String>>of(List.<String>of("a", "a"))); check(false, "cycle 1 topoSort did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: a -> a", e.getMessage(), "cycle 1 topoSort"); }
        try { TopoSort.topoLevels(List.<String>of("a"), List.<List<String>>of(List.<String>of("a", "a"))); check(false, "cycle 1 topoLevels did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: a -> a", e.getMessage(), "cycle 1 topoLevels"); }
        try { TopoSort.topoSort(List.<String>of("p", "q", "r", "s"), List.<List<String>>of(List.<String>of("p", "q"), List.<String>of("q", "r"), List.<String>of("r", "p"), List.<String>of("r", "s"))); check(false, "cycle 2 topoSort did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: p -> q -> r -> p", e.getMessage(), "cycle 2 topoSort"); }
        try { TopoSort.topoLevels(List.<String>of("p", "q", "r", "s"), List.<List<String>>of(List.<String>of("p", "q"), List.<String>of("q", "r"), List.<String>of("r", "p"), List.<String>of("r", "s"))); check(false, "cycle 2 topoLevels did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: p -> q -> r -> p", e.getMessage(), "cycle 2 topoLevels"); }
        try { TopoSort.topoSort(List.<String>of("z", "a", "b"), List.<List<String>>of(List.<String>of("a", "z"), List.<String>of("a", "b"), List.<String>of("b", "a"))); check(false, "cycle 3 topoSort did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: a -> b -> a", e.getMessage(), "cycle 3 topoSort"); }
        try { TopoSort.topoLevels(List.<String>of("z", "a", "b"), List.<List<String>>of(List.<String>of("a", "z"), List.<String>of("a", "b"), List.<String>of("b", "a"))); check(false, "cycle 3 topoLevels did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: a -> b -> a", e.getMessage(), "cycle 3 topoLevels"); }
        try { TopoSort.topoSort(List.<String>of("s", "x", "y", "d"), List.<List<String>>of(List.<String>of("x", "d"), List.<String>of("x", "y"), List.<String>of("y", "x"), List.<String>of("d", "s"))); check(false, "cycle 4 topoSort did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: x -> y -> x", e.getMessage(), "cycle 4 topoSort"); }
        try { TopoSort.topoLevels(List.<String>of("s", "x", "y", "d"), List.<List<String>>of(List.<String>of("x", "d"), List.<String>of("x", "y"), List.<String>of("y", "x"), List.<String>of("d", "s"))); check(false, "cycle 4 topoLevels did not throw"); } catch (TopoSort.CycleException e) { eq("cycle: x -> y -> x", e.getMessage(), "cycle 4 topoLevels"); }
        throwsIae(() -> TopoSort.topoSort(List.<String>of("a"), List.<List<String>>of(List.<String>of("a", "b"))), "invalid 0 topoSort");
        throwsIae(() -> TopoSort.topoLevels(List.<String>of("a"), List.<List<String>>of(List.<String>of("a", "b"))), "invalid 0 topoLevels");
        throwsIae(() -> TopoSort.topoSort(List.<String>of("a", "a"), List.<List<String>>of()), "invalid 1 topoSort");
        throwsIae(() -> TopoSort.topoLevels(List.<String>of("a", "a"), List.<List<String>>of()), "invalid 1 topoLevels");

        System.out.println("TopoSortTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
