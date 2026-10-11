// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class PunycodeTest {
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
        eq("bcher-kva", Punycode.punycodeEncode("b\u00FCcher"), "encode 0");
        eq("mnchen-3ya", Punycode.punycodeEncode("m\u00FCnchen"), "encode 1");
        eq("wgv71a119e", Punycode.punycodeEncode("\u65E5\u672C\u8A9E"), "encode 2");
        eq("tda", Punycode.punycodeEncode("\u00FC"), "encode 3");
        eq("abc-", Punycode.punycodeEncode("abc"), "encode 4");
        eq("Maana-pta", Punycode.punycodeEncode("Ma\u00F1ana"), "encode 5");
        eq("hxargifdar", Punycode.punycodeEncode("\u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"), "encode 6");
        eq("80aafi6cg", Punycode.punycodeEncode("\u043F\u0440\u0430\u0432\u0434\u0430"), "encode 7");
        eq("e28h", Punycode.punycodeEncode("\uD83D\uDE00"), "encode 8");
        eq("a-b-", Punycode.punycodeEncode("a-b"), "encode 9");
        eq("--", Punycode.punycodeEncode("-"), "encode 10");
        eq("mgbmm8erar", Punycode.punycodeEncode("\u0627\u0644\u062D\u0631\u064A\u0647"), "encode 11");
        eq("Hello-Another-Way--fc4qua05auwb3674vfr0b", Punycode.punycodeEncode("Hello-Another-Way-\u305D\u308C\u305E\u308C\u306E\u5834\u6240"), "encode 12");
        eq("BER-ska", Punycode.punycodeEncode("\u00DCBER"), "encode 13");
        eq("x-bga22n", Punycode.punycodeEncode("x\u00E9\u0301"), "encode 14");
        eq("b\u00FCcher", Punycode.punycodeDecode("bcher-kva"), "decode 0");
        eq("m\u00FCnchen", Punycode.punycodeDecode("mnchen-3ya"), "decode 1");
        eq("\u65E5\u672C\u8A9E", Punycode.punycodeDecode("wgv71a119e"), "decode 2");
        eq("\u00FC", Punycode.punycodeDecode("tda"), "decode 3");
        eq("abc", Punycode.punycodeDecode("abc-"), "decode 4");
        eq("Ma\u00F1ana", Punycode.punycodeDecode("Maana-pta"), "decode 5");
        eq("\u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC", Punycode.punycodeDecode("hxargifdar"), "decode 6");
        eq("\u043F\u0440\u0430\u0432\u0434\u0430", Punycode.punycodeDecode("80aafi6cg"), "decode 7");
        eq("\uD83D\uDE00", Punycode.punycodeDecode("e28h"), "decode 8");
        eq("a-b", Punycode.punycodeDecode("a-b-"), "decode 9");
        eq("-", Punycode.punycodeDecode("--"), "decode 10");
        eq("\u0627\u0644\u062D\u0631\u064A\u0647", Punycode.punycodeDecode("mgbmm8erar"), "decode 11");
        eq("Hello-Another-Way-\u305D\u308C\u305E\u308C\u306E\u5834\u6240", Punycode.punycodeDecode("Hello-Another-Way--fc4qua05auwb3674vfr0b"), "decode 12");
        eq("\u00DCBER", Punycode.punycodeDecode("BER-ska"), "decode 13");
        eq("x\u00E9\u0301", Punycode.punycodeDecode("x-bga22n"), "decode 14");
        eq("b\u00FCcher", Punycode.punycodeDecode("bcher-kva"), "decode 15");
        eq("xn--bcher-kva.example", Punycode.domainToAscii("B\u00FCcher.Example"), "domainToAscii 0");
        eq("example.com", Punycode.domainToAscii("EXAMPLE.com"), "domainToAscii 1");
        eq("xn--wgv71a119e.jp.", Punycode.domainToAscii("\u65E5\u672C\u8A9E.jp."), "domainToAscii 2");
        eq("xn--mnchen-3ya.de", Punycode.domainToAscii("m\u00FCnchen.de"), "domainToAscii 3");
        eq("a.b.c", Punycode.domainToAscii("a.b.c"), "domainToAscii 4");
        eq("b\u00FCcher.example", Punycode.domainToUnicode("xn--bcher-kva.example"), "domainToUnicode 0");
        eq("\u65E5\u672C\u8A9E.jp", Punycode.domainToUnicode("XN--wgv71a119e.jp"), "domainToUnicode 1");
        eq("plain.com", Punycode.domainToUnicode("plain.com"), "domainToUnicode 2");
        throwsIae(() -> Punycode.punycodeDecode("bcher-kv!"), "invalid decode 0");
        throwsIae(() -> Punycode.punycodeDecode("a-99999999999999999999"), "invalid decode 1");
        throwsIae(() -> Punycode.punycodeDecode("\u00FC-abc"), "invalid decode 2");
        throwsIae(() -> Punycode.punycodeDecode("xyzzy123456789zzzz"), "invalid decode 3");
        throwsIae(() -> Punycode.domainToAscii("a..b"), "invalid domain 0");
        throwsIae(() -> Punycode.domainToAscii(".x"), "invalid domain 1");
        throwsIae(() -> Punycode.domainToAscii("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com"), "invalid domain 2");
        throwsIae(() -> Punycode.domainToAscii("\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC.com"), "invalid domain 3");
        throwsIae(() -> Punycode.punycodeDecode("abc-\u00FC"), "non-digit after delimiter");
        throwsIae(() -> Punycode.punycodeDecode("z"), "truncated");
        throwsIae(() -> Punycode.punycodeDecode("99999a"), "decodes past U+10FFFF");

        System.out.println("PunycodeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
