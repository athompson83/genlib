// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class RomanNumeralsTest {
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
        eq("I", RomanNumerals.toRoman(1), "to 1");
        eq("IV", RomanNumerals.toRoman(4), "to 4");
        eq("IX", RomanNumerals.toRoman(9), "to 9");
        eq("XIV", RomanNumerals.toRoman(14), "to 14");
        eq("XL", RomanNumerals.toRoman(40), "to 40");
        eq("XC", RomanNumerals.toRoman(90), "to 90");
        eq("CD", RomanNumerals.toRoman(400), "to 400");
        eq("MCMXCIV", RomanNumerals.toRoman(1994), "to 1994");
        eq("MMXXVI", RomanNumerals.toRoman(2026), "to 2026");
        eq("MMMDCCCLXXXVIII", RomanNumerals.toRoman(3888), "to 3888");
        eq("MMMCMXCIX", RomanNumerals.toRoman(3999), "to 3999");
        eq(1, RomanNumerals.fromRoman("I"), "from I");
        eq(4, RomanNumerals.fromRoman("iv"), "from iv");
        eq(1994, RomanNumerals.fromRoman("MCMXCIV"), "from MCMXCIV");
        eq(2026, RomanNumerals.fromRoman("mmxxvi"), "from mmxxvi");
        eq(3999, RomanNumerals.fromRoman("MMMCMXCIX"), "from MMMCMXCIX");
        throwsIae(() -> RomanNumerals.toRoman(0), "invalid to 0");
        throwsIae(() -> RomanNumerals.toRoman(4000), "invalid to 4000");
        throwsIae(() -> RomanNumerals.toRoman(-5), "invalid to -5");
        throwsIae(() -> RomanNumerals.fromRoman(""), "invalid from 0");
        throwsIae(() -> RomanNumerals.fromRoman("IIII"), "invalid from 1");
        throwsIae(() -> RomanNumerals.fromRoman("IC"), "invalid from 2");
        throwsIae(() -> RomanNumerals.fromRoman("VX"), "invalid from 3");
        throwsIae(() -> RomanNumerals.fromRoman("MMMM"), "invalid from 4");
        throwsIae(() -> RomanNumerals.fromRoman("ABC"), "invalid from 5");
        throwsIae(() -> RomanNumerals.fromRoman("IIV"), "invalid from 6");
        throwsIae(() -> RomanNumerals.fromRoman("XM"), "invalid from 7");
        for (int n = 1; n <= 3999; n++) check(RomanNumerals.fromRoman(RomanNumerals.toRoman(n)) == n, "round trip " + n);

        System.out.println("RomanNumeralsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
