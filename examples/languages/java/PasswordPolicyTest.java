// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.

/** Wave 7 vectors (shared with every Genlib language) for password-policy. */
public final class PasswordPolicyTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq(new PasswordPolicy.Result(true, java.util.List.of()), PasswordPolicy.checkPassword("correct horse battery staple", new PasswordPolicy.Options()), "password case 0");
        eq(new PasswordPolicy.Result(false, java.util.List.of("too-short")), PasswordPolicy.checkPassword("short", new PasswordPolicy.Options()), "password case 1");
        eq(new PasswordPolicy.Result(true, java.util.List.of()), PasswordPolicy.checkPassword("Tr0ub4dor&3", new PasswordPolicy.Options().minLength(8)), "password case 2");
        eq(new PasswordPolicy.Result(false, java.util.List.of("blocklisted")), PasswordPolicy.checkPassword("password", new PasswordPolicy.Options().minLength(8).blocklist(java.util.List.of("Password", "123456"))), "password case 3");
        eq(new PasswordPolicy.Result(false, java.util.List.of("too-long", "repetitive")), PasswordPolicy.checkPassword("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", new PasswordPolicy.Options().maxLength(64)), "password case 4");
        eq(new PasswordPolicy.Result(false, java.util.List.of("repetitive")), PasswordPolicy.checkPassword("aaaa-unique-phrase-x", new PasswordPolicy.Options()), "password case 5");
        eq(new PasswordPolicy.Result(false, java.util.List.of("repetitive")), PasswordPolicy.checkPassword("my-1234-long-passphrase", new PasswordPolicy.Options()), "password case 6");
        eq(new PasswordPolicy.Result(false, java.util.List.of("repetitive")), PasswordPolicy.checkPassword("zyxw-backwards-phrase!", new PasswordPolicy.Options()), "password case 7");
        eq(new PasswordPolicy.Result(false, java.util.List.of("contains-context")), PasswordPolicy.checkPassword("alice-secret-passphrase", new PasswordPolicy.Options().context(java.util.List.of("alice", "example"))), "password case 8");
        eq(new PasswordPolicy.Result(false, java.util.List.of("control-characters")), PasswordPolicy.checkPassword("tab\tinside-long-enough", new PasswordPolicy.Options()), "password case 9");
        eq(new PasswordPolicy.Result(true, java.util.List.of()), PasswordPolicy.checkPassword("\u00FCn\u00EFc\u00F6d\u00E9-p\u00E4ssw\u00F6rd-long", new PasswordPolicy.Options()), "password case 10");
        eq(new PasswordPolicy.Result(false, java.util.List.of("repetitive")), PasswordPolicy.checkPassword("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", new PasswordPolicy.Options()), "password case 11");
        eq(new PasswordPolicy.Result(false, java.util.List.of("repetitive")), PasswordPolicy.checkPassword("ABCD-upper-sequence-x", new PasswordPolicy.Options()), "password case 12");
        throwsIae(() -> PasswordPolicy.checkPassword("x", new PasswordPolicy.Options().minLength(0)), "password minLength 0");
        throwsIae(() -> PasswordPolicy.checkPassword("x", new PasswordPolicy.Options().minLength(10).maxLength(9)), "password max < min");

        System.out.println("PasswordPolicyTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
