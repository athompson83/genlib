// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class PiiMaskTest {
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
        eq("j*******@example.com", PiiMask.maskEmail("jane.doe@example.com"), "email 0");
        eq("a***@b.co", PiiMask.maskEmail("a@b.co"), "email 1");
        eq("a***@x.io", PiiMask.maskEmail("ab@x.io"), "email 2");
        eq("\u00E9****@ex.fr", PiiMask.maskEmail("\u00E9mile@ex.fr"), "email 3");
        eq("+1 (***) ***-0123", PiiMask.maskPhone("+1 (415) 555-0123"), "phone 0");
        eq("+44 ** **** 0958", PiiMask.maskPhone("+44 20 7946 0958"), "phone 1");
        eq("******5678", PiiMask.maskPhone("0612345678"), "phone 2");
        eq("***-**23-99", PiiMask.maskPhone("555-0123-99"), "phone 3");
        eq("**** **** **** 1111", PiiMask.maskCard("4111 1111 1111 1111"), "card 0");
        eq("****-****-****-1111", PiiMask.maskCard("4111-1111-1111-1111"), "card 1");
        eq("***********0005", PiiMask.maskCard("378282246310005"), "card 2");
        eq("************9424", PiiMask.maskCard("6011000990139424"), "card 3");
        eq("se********en", PiiMask.maskMiddle("secret-token", 2, 2, "*"), "middle 0");
        eq("a*c", PiiMask.maskMiddle("abc", 1, 1, "*"), "middle 1");
        eq("**", PiiMask.maskMiddle("ab", 1, 1, "*"), "middle 2");
        eq("********", PiiMask.maskMiddle("password", 0, 0, "*"), "middle 3");
        eq("h****", PiiMask.maskMiddle("h\u00E9llo", 1, 0, "*"), "middle 4");
        eq("contact j***@example.com today", PiiMask.redact("contact jane@example.com today"), "redact 0");
        eq("card **** **** **** 1111 exp", PiiMask.redact("card 4111 1111 1111 1111 exp"), "redact 1");
        eq("order 1234 5678 9012 3456 ok", PiiMask.redact("order 1234 5678 9012 3456 ok"), "redact 2");
        eq("two a***@b.io, c***@e.org", PiiMask.redact("two a@b.io, c.d@e.org"), "redact 3");
        eq("id ************1111x", PiiMask.redact("id 4111111111111111x"), "redact 4");
        throwsIae(() -> PiiMask.maskEmail("nope"), "invalid_email 0");
        throwsIae(() -> PiiMask.maskEmail("a@b@c"), "invalid_email 1");
        throwsIae(() -> PiiMask.maskEmail("@x.com"), "invalid_email 2");
        throwsIae(() -> PiiMask.maskEmail("x@"), "invalid_email 3");
        throwsIae(() -> PiiMask.maskPhone("123"), "invalid_phone 0");
        throwsIae(() -> PiiMask.maskPhone("+1 55"), "invalid_phone 1");
        throwsIae(() -> PiiMask.maskCard("4111"), "invalid_card 0");
        throwsIae(() -> PiiMask.maskCard("4111 1111 1111 1111 1111 1"), "invalid_card 1");
        throwsIae(() -> PiiMask.maskCard("4111a1111111111"), "invalid_card 2");
        eq("s*****", PiiMask.maskMiddle("secret", 1, 0, "*"), "middle keepEnd 0");
        throwsIae(() -> PiiMask.maskMiddle("x", -1, 1, "*"), "middle negative keep");
        throwsIae(() -> PiiMask.maskMiddle("x", 1, 1, "**"), "middle long mask");
        throwsIae(() -> PiiMask.redact("x", List.of("phone")), "redact unsupported kind");
        eq("a***@b.co 4111 1111 1111 1111", PiiMask.redact("ab@b.co 4111 1111 1111 1111", List.of("email")), "redact email only");

        System.out.println("PiiMaskTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
