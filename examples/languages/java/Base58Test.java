// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class Base58Test {
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
        eq("", Base58.base58Encode(hex("")), "encode 0");
        eq("", toHex(Base58.base58Decode("")), "decode 0");
        eq("1", Base58.base58Encode(hex("00")), "encode 1");
        eq("00", toHex(Base58.base58Decode("1")), "decode 1");
        eq("112", Base58.base58Encode(hex("000001")), "encode 2");
        eq("000001", toHex(Base58.base58Decode("112")), "decode 2");
        eq("StV1DL6CwTryKyV", Base58.base58Encode(hex("68656c6c6f20776f726c64")), "encode 3");
        eq("68656c6c6f20776f726c64", toHex(Base58.base58Decode("StV1DL6CwTryKyV")), "decode 3");
        eq("1kA3B2yGe2z4", Base58.base58Encode(hex("00010203040506070809")), "encode 4");
        eq("00010203040506070809", toHex(Base58.base58Decode("1kA3B2yGe2z4")), "decode 4");
        eq("jpXCZedGfVQ", Base58.base58Encode(hex("ffffffffffffffff")), "encode 5");
        eq("ffffffffffffffff", toHex(Base58.base58Decode("jpXCZedGfVQ")), "decode 5");
        eq("11Cn8eVZg", Base58.base58Encode(hex("000068656c6c6f")), "encode 6");
        eq("000068656c6c6f", toHex(Base58.base58Decode("11Cn8eVZg")), "decode 6");
        eq("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs", Base58.base58CheckEncode(hex("00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31")), "check encode 0");
        eq("00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31", toHex(Base58.base58CheckDecode("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs")), "check decode 0");
        eq("5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh", Base58.base58CheckEncode(hex("801111111111111111111111111111111111111111111111111111111111111111")), "check encode 1");
        eq("801111111111111111111111111111111111111111111111111111111111111111", toHex(Base58.base58CheckDecode("5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh")), "check decode 1");
        eq("3QJmnh", Base58.base58CheckEncode(hex("")), "check encode 2");
        eq("", toHex(Base58.base58CheckDecode("3QJmnh")), "check decode 2");
        throwsIae(() -> Base58.base58Decode("0OIl"), "invalid decode 0");
        throwsIae(() -> Base58.base58Decode("abc+"), "invalid decode 1");
        throwsIae(() -> Base58.base58CheckDecode("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt"), "invalid check 0");
        throwsIae(() -> Base58.base58CheckDecode("1"), "invalid check 1");
        throwsIae(() -> Base58.base58CheckDecode(""), "invalid check 2");

        System.out.println("Base58Test: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
