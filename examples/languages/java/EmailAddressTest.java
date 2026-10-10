// SPDX-License-Identifier: Apache-2.0

public final class EmailAddressTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        String a63 = "a".repeat(63);
        String longDomain = a63 + "." + a63 + "." + a63 + ".";
        Object[][] valid = {
            {"user@example.com", true}, {"first.last+tag@sub.Example.CO.uk", true}, {"o'brien@example.ie", true}, {"a@b", true},
            {"user@-example.com", false}, {"user@example-.com", false}, {"user@exa_mple.com", false}, {"user example@example.com", false},
            {"user@@example.com", false}, {"@example.com", false}, {"user@", false}, {"user@example..com", false}, {"user.@example.com", true},
            {"ünïcode@example.com", false}, {"x".repeat(64) + "@example.com", true}, {"x".repeat(65) + "@example.com", false},
            {"u@" + longDomain + "b".repeat(59), true}, {"u@" + longDomain + "b".repeat(61), false}, {"user@" + "a".repeat(64) + ".com", false},
        };
        for (Object[] v : valid) eq(v[1], EmailAddress.emailValid((String) v[0]), "valid " + v[0]);
        eq("Mixed.Case@example.com", EmailAddress.emailNormalize("  Mixed.Case@Example.COM "), "normalize");
        throwsIae(() -> EmailAddress.emailNormalize("not an email"), "normalize invalid");
        check(!EmailAddress.emailValid(null), "null is invalid");

        System.out.println("EmailAddressTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
