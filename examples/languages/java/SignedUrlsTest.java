// SPDX-License-Identifier: Apache-2.0

public final class SignedUrlsTest {
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

    private static void ok(String url, String secret, long now, String name) {
        try { SignedUrls.verifyUrl(url, secret, now); check(true, name); }
        catch (IllegalArgumentException e) { check(false, name + " threw " + e.getMessage()); }
    }

    private static void kind(SignedUrls.Kind expected, String url, String secret, long now, String name) {
        try { SignedUrls.verifyUrl(url, secret, now); check(false, name + " did not throw"); }
        catch (SignedUrls.SignedUrlException e) { check(e.kind() == expected, name + " expected " + expected + " got " + e.kind()); }
    }

    private static String flip(String s, int i) {
        char c = s.charAt(i);
        return s.substring(0, i) + (c == 'A' ? 'B' : 'A') + s.substring(i + 1);
    }

    public static void main(String[] args) {
        String secret = "url-signing-secret";
        String[][] cases = {
            {"/files/report.pdf?user=42", "1790000000", "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"},
            {"/download/a%20b.zip", "1790003600", "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"},
        };
        for (String[] c : cases) {
            long exp = Long.parseLong(c[1]);
            String signed = c[2];
            eq(signed, SignedUrls.signUrl(c[0], secret, exp), "sign " + c[0]);
            ok(signed, secret, exp, "verifies at expires " + c[0]);
            ok(signed, secret, exp - 1000, "verifies before expires " + c[0]);
            kind(SignedUrls.Kind.EXPIRED, signed, secret, exp + 1, "expired at expires+1 " + c[0]);
            kind(SignedUrls.Kind.BAD_SIGNATURE, flip(signed, 2), secret, exp, "path char changed " + c[0]);
            kind(SignedUrls.Kind.BAD_SIGNATURE, signed, secret + "x", exp, "different secret " + c[0]);
            kind(SignedUrls.Kind.BAD_SIGNATURE, flip(signed, signed.length() - 5), secret, exp, "signature char changed " + c[0]);
            String unsigned = signed.substring(0, signed.lastIndexOf("&signature="));
            kind(SignedUrls.Kind.MALFORMED, unsigned, secret, exp, "signature removed " + c[0]);
        }
        String sig = cases[0][2].substring(cases[0][2].lastIndexOf('=') + 1);
        kind(SignedUrls.Kind.MALFORMED, "/f?expires=1790000000&expires=1790000000&signature=" + sig, secret, 0, "duplicate expires");
        kind(SignedUrls.Kind.MALFORMED, "/f?expires=17900x0000&signature=" + sig, secret, 0, "non-decimal expires");
        kind(SignedUrls.Kind.MALFORMED, "/f?user=1&signature=" + sig, secret, 0, "missing expires");
        kind(SignedUrls.Kind.MALFORMED, cases[0][2] + "x", secret, 0, "signature too long");
        kind(SignedUrls.Kind.MALFORMED, cases[0][2] + "#frag", secret, 0, "signature not at end");
        throwsIae(() -> SignedUrls.signUrl("/a?expires=5", secret, 1), "target with expires");
        throwsIae(() -> SignedUrls.signUrl("/a?x=1&signature=abc", secret, 1), "target with signature");
        throwsIae(() -> SignedUrls.signUrl("/a#top", secret, 1), "target with fragment");
        throwsIae(() -> SignedUrls.signUrl("https://x/a", secret, 1), "target not a path");
        throwsIae(() -> SignedUrls.signUrl("/a", "", 1), "sign empty secret");
        throwsIae(() -> SignedUrls.verifyUrl(cases[0][2], "", 1), "verify empty secret");

        System.out.println("SignedUrlsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
