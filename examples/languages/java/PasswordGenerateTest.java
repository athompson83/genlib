// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class PasswordGenerateTest {
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
        IntSupplier src0 = bytes("00ff10a37c55e2019b");
        eq(List.of(0, 6, 3, 4, 5, 6), List.of(PasswordGenerate.randomIndex(10, src0), PasswordGenerate.randomIndex(10, src0), PasswordGenerate.randomIndex(10, src0), PasswordGenerate.randomIndex(10, src0), PasswordGenerate.randomIndex(10, src0), PasswordGenerate.randomIndex(10, src0)), "random index 0");
        IntSupplier src1 = bytes("ffff0102a0b0");
        eq(List.of(258, 36, 258, 36, 258, 36), List.of(PasswordGenerate.randomIndex(300, src1), PasswordGenerate.randomIndex(300, src1), PasswordGenerate.randomIndex(300, src1), PasswordGenerate.randomIndex(300, src1), PasswordGenerate.randomIndex(300, src1), PasswordGenerate.randomIndex(300, src1)), "random index 1");
        IntSupplier src2 = bytes("00");
        eq(List.of(0, 0, 0, 0, 0, 0), List.of(PasswordGenerate.randomIndex(1, src2), PasswordGenerate.randomIndex(1, src2), PasswordGenerate.randomIndex(1, src2), PasswordGenerate.randomIndex(1, src2), PasswordGenerate.randomIndex(1, src2), PasswordGenerate.randomIndex(1, src2)), "random index 2");
        IntSupplier src3 = bytes("ab");
        eq(List.of(171, 171, 171, 171, 171, 171), List.of(PasswordGenerate.randomIndex(256, src3), PasswordGenerate.randomIndex(256, src3), PasswordGenerate.randomIndex(256, src3), PasswordGenerate.randomIndex(256, src3), PasswordGenerate.randomIndex(256, src3), PasswordGenerate.randomIndex(256, src3)), "random index 3");
        IntSupplier src4 = bytes("f0f8fc00");
        eq(List.of(54, 0, 54, 0, 54, 0), List.of(PasswordGenerate.randomIndex(62, src4), PasswordGenerate.randomIndex(62, src4), PasswordGenerate.randomIndex(62, src4), PasswordGenerate.randomIndex(62, src4), PasswordGenerate.randomIndex(62, src4), PasswordGenerate.randomIndex(62, src4)), "random index 4");
        eq("jl__j_ad3WbbdqQa", PasswordGenerate.generatePassword(16, List.of("lower", "upper", "digits", "symbols"), bytes("00ff10a37c55e2019b"), false), "password 0");
        eq("hkjibfmdnge4", PasswordGenerate.generatePassword(12, List.of("lower", "digits"), bytes("0102030405060708090a0b0c0d0e0f"), true), "password 1");
        eq("X7x#", PasswordGenerate.generatePassword(4, List.of("upper", "lower", "digits", "symbols"), bytes("7f"), false), "password 2");
        eq("!!!!!!!!!!!!!!!!!!!!", PasswordGenerate.generatePassword(20, List.of("symbols"), bytes("ffffffffffffffff00"), false), "password 3");
        eq("river-stone-cloud-maple", PasswordGenerate.generatePassphrase(List.of("apple", "river", "stone", "cloud", "maple"), 4, "-", bytes("0102030405")), "passphrase 0");
        eq("b a b", PasswordGenerate.generatePassphrase(List.of("a", "b"), 3, " ", bytes("ff00")), "passphrase 1");
        eq(99.97, PasswordGenerate.entropyBits(76, 16), "entropy 0");
        eq(19.93, PasswordGenerate.entropyBits(10, 6), "entropy 1");
        eq(64.62, PasswordGenerate.entropyBits(7776, 5), "entropy 2");
        eq(1.0, PasswordGenerate.entropyBits(2, 1), "entropy 3");
        throwsIae(() -> PasswordGenerate.generatePassword(3, List.of("lower", "upper", "digits", "symbols"), bytes("00"), false), "invalid password 0");
        throwsIae(() -> PasswordGenerate.generatePassword(8, List.of(), bytes("00"), false), "invalid password 1");
        throwsIae(() -> PasswordGenerate.generatePassword(8, List.of("lower", "lower"), bytes("00"), false), "invalid password 2");
        throwsIae(() -> PasswordGenerate.generatePassword(8, List.of("emoji"), bytes("00"), false), "invalid password 3");
        throwsIae(() -> PasswordGenerate.generatePassword(1025, List.of("lower"), bytes("00"), false), "invalid password 4");
        throwsIae(() -> PasswordGenerate.generatePassphrase(List.of("a"), 3, "-", bytes("00")), "invalid passphrase 0");
        throwsIae(() -> PasswordGenerate.generatePassphrase(List.of("a", "b"), 0, "-", bytes("00")), "invalid passphrase 1");
        throwsIae(() -> PasswordGenerate.generatePassphrase(List.of("a", "b"), 65, "-", bytes("00")), "invalid passphrase 2");
        throwsIae(() -> PasswordGenerate.generatePassphrase(List.of("a", ""), 2, "-", bytes("00")), "invalid passphrase 3");
        throwsIae(() -> PasswordGenerate.randomIndex(0, bytes("00")), "random index n < 1");
        String secure = PasswordGenerate.generatePassword();
        check(secure.length() == 16 && secure.chars().anyMatch(Character::isLowerCase) && secure.chars().anyMatch(Character::isUpperCase) && secure.chars().anyMatch(Character::isDigit) && secure.chars().anyMatch(c -> "!#$%&*+-=?@^_~".indexOf(c) >= 0), "secure default password");
        check(PasswordGenerate.generatePassphrase(List.of("a", "b"), 3, "-").split("-").length == 3, "secure passphrase");

        System.out.println("PasswordGenerateTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
