// SPDX-License-Identifier: Apache-2.0

public final class WebhookSignatureTest {
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

    private static void ok(String header, String body, String secret, long now, String name) {
        try { WebhookSignature.verifyWebhook(header, body, secret, now); check(true, name); }
        catch (IllegalArgumentException e) { check(false, name + " threw " + e.getMessage()); }
    }

    private static void kind(WebhookSignature.Kind expected, String header, String body, String secret, long now, String name) {
        try { WebhookSignature.verifyWebhook(header, body, secret, now); check(false, name + " did not throw"); }
        catch (WebhookSignature.WebhookException e) { check(e.kind() == expected, name + " expected " + expected + " got " + e.kind()); }
    }

    public static void main(String[] args) {
        String secret = "whsec_test_secret_0123456789abcd";
        String body = "{\"id\":\"evt_1\",\"amount\":1999}";
        long t = 1790000000L;
        String sig = "ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6";
        String header = "t=1790000000,v1=" + sig;
        eq(header, WebhookSignature.signWebhook(secret, t, body), "sign vector header");
        ok(header, body, secret, t, "verifies at t");
        ok(header, body, secret, t + 300, "verifies at t+300");
        ok(header, body, secret, t - 300, "verifies at t-300");
        kind(WebhookSignature.Kind.EXPIRED, header, body, secret, t + 301, "expired at t+301");
        kind(WebhookSignature.Kind.EXPIRED, header, body, secret, t - 301, "expired at t-301");
        kind(WebhookSignature.Kind.BAD_SIGNATURE, header, body.replace("1999", "1998"), secret, t, "one body byte changed");
        kind(WebhookSignature.Kind.BAD_SIGNATURE, header, body, secret + "x", t, "different secret");
        kind(WebhookSignature.Kind.BAD_SIGNATURE, header.substring(0, header.length() - 1) + "7", body, secret, t, "one hex digit changed");
        ok("t=1790000000,v1=" + "0".repeat(64) + ",v1=" + sig, body, secret, t, "extra zero v1 before the right one");
        ok(" t = 1790000000 , v0=abc, v1 = " + sig + " ", body, secret, t, "whitespace tolerant, other schemes ignored");
        kind(WebhookSignature.Kind.MALFORMED, "v1=" + sig, body, secret, t, "missing t");
        kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,t=1790000000,v1=" + sig, body, secret, t, "two t");
        kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,v1=" + sig.replace('a', 'g'), body, secret, t, "non-hex v1");
        kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,v1=" + sig.toUpperCase(java.util.Locale.ROOT), body, secret, t, "upper-case v1");
        kind(WebhookSignature.Kind.MALFORMED, "t=1790000000", body, secret, t, "no v1");
        kind(WebhookSignature.Kind.MALFORMED, "t=17900000x0,v1=" + sig, body, secret, t, "non-decimal t");
        kind(WebhookSignature.Kind.MALFORMED, "garbage", body, secret, t, "no pairs");
        kind(WebhookSignature.Kind.EXPIRED, header, body, secret, Long.MIN_VALUE, "far past now does not overflow");
        throwsIae(() -> WebhookSignature.signWebhook("", t, body), "sign empty secret");
        throwsIae(() -> WebhookSignature.verifyWebhook(header, body, "", t), "verify empty secret");
        throwsIae(() -> WebhookSignature.verifyWebhook(header, body, secret, t, -1), "negative tolerance");

        System.out.println("WebhookSignatureTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
