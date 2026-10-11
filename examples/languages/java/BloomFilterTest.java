// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class BloomFilterTest {
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
        eq("f74a62a458befdbf", String.format("%016x", BloomFilter.fnv1a64("apple".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 0");
        eq("b4d3b6b1c372c890", String.format("%016x", BloomFilter.fnv1a64("banana".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 1");
        eq("cbf29ce484222325", String.format("%016x", BloomFilter.fnv1a64("".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 2");
        eq("48e8823acfa40d89", String.format("%016x", BloomFilter.fnv1a64("caf\u00e9".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 3");
        eq("feff073875020288", String.format("%016x", BloomFilter.fnv1a64("\ud83d\ude00".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 4");
        eq("6c151ea4dcd221c2", String.format("%016x", BloomFilter.fnv1a64("user:42".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 5");
        eq("060324515a7b4e27", String.format("%016x", BloomFilter.fnv1a64("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".getBytes(java.nio.charset.StandardCharsets.UTF_8))), "fnv 6");
        eq(new BloomFilter.Size(8, 6), BloomFilter.bloomSizeFor(1, 0.5), "size 0");
        eq(new BloomFilter.Size(96, 7), BloomFilter.bloomSizeFor(10, 0.01), "size 1");
        eq(new BloomFilter.Size(959, 7), BloomFilter.bloomSizeFor(100, 0.01), "size 2");
        eq(new BloomFilter.Size(14378, 10), BloomFilter.bloomSizeFor(1000, 0.001), "size 3");
        eq(new BloomFilter.Size(31177, 4), BloomFilter.bloomSizeFor(5000, 0.05), "size 4");
        eq(new BloomFilter.Size(8, 2), BloomFilter.bloomSizeFor(3, 0.3), "size 5");
        throwsIae(() -> BloomFilter.bloomSizeFor(0, 0.1), "invalid size 0");
        throwsIae(() -> BloomFilter.bloomSizeFor(10, 0.0), "invalid size 1");
        throwsIae(() -> BloomFilter.bloomSizeFor(10, 1.0), "invalid size 2");
        throwsIae(() -> BloomFilter.bloomSizeFor(10, 1.5), "invalid size 3");
        BloomFilter b = new BloomFilter(256, 5);
        check(Arrays.equals(new int[] {191, 99, 7, 171, 79}, b.positions("apple")), "positions 0 " + Arrays.toString(b.positions("apple")));
        check(Arrays.equals(new int[] {144, 65, 242, 163, 84}, b.positions("banana")), "positions 1 " + Arrays.toString(b.positions("banana")));
        check(Arrays.equals(new int[] {37, 9, 237, 209, 181}, b.positions("")), "positions 2 " + Arrays.toString(b.positions("")));
        check(Arrays.equals(new int[] {137, 195, 253, 55, 113}, b.positions("caf\u00e9")), "positions 3 " + Arrays.toString(b.positions("caf\u00e9")));
        check(Arrays.equals(new int[] {136, 192, 248, 48, 104}, b.positions("\ud83d\ude00")), "positions 4 " + Arrays.toString(b.positions("\ud83d\ude00")));
        check(Arrays.equals(new int[] {194, 102, 10, 174, 82}, b.positions("user:42")), "positions 5 " + Arrays.toString(b.positions("user:42")));
        check(Arrays.equals(new int[] {39, 120, 201, 26, 107}, b.positions("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")), "positions 6 " + Arrays.toString(b.positions("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")));
        b.add("apple");
        b.add("banana");
        b.add("");
        b.add("caf\u00e9");
        b.add("\ud83d\ude00");
        eq("gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE", b.serialize(), "serialized");
        eq(true, b.mightContain("apple"), "probe 0");
        eq(true, b.mightContain("banana"), "probe 1");
        eq(true, b.mightContain(""), "probe 2");
        eq(true, b.mightContain("caf\u00e9"), "probe 3");
        eq(true, b.mightContain("\ud83d\ude00"), "probe 4");
        eq(false, b.mightContain("cherry"), "probe 5");
        eq(false, b.mightContain("user:42"), "probe 6");
        eq(false, b.mightContain("zzz"), "probe 7");
        eq(false, b.mightContain("Apple"), "probe 8");
        eq(5L, b.countEstimate(), "count estimate");
        BloomFilter c = new BloomFilter(256, 5);
        c.add("cherry");
        BloomFilter u = b.union(c);
        eq("gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE", u.serialize(), "union");
        eq(6L, u.countEstimate(), "union count");
        eq(true, u.mightContain("cherry"), "union has cherry");
        eq(b.serialize(), BloomFilter.deserialize(256, 5, b.serialize()).serialize(), "deserialize round trip");
        eq(true, BloomFilter.deserialize(256, 5, b.serialize()).mightContain("apple"), "deserialized probe");
        throwsIae(() -> BloomFilter.deserialize(256, 5, "AAAA"), "deserialize wrong length");
        throwsIae(() -> b.union(new BloomFilter(256, 6)), "union mismatch");
        throwsIae(() -> new BloomFilter(7, 1), "m too small");
        BloomFilter full = new BloomFilter(8, 1);
        for (int i = 0; i < 200; i++) full.add("x" + i);
        eq(null, full.countEstimate(), "saturated");

        System.out.println("BloomFilterTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
