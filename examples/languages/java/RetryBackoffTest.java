// SPDX-License-Identifier: Apache-2.0

public final class RetryBackoffTest {
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
        eq(50L, RetryBackoff.backoffDelay(0, 100, 10000, 0.5), "backoff a0");
        eq(799L, RetryBackoff.backoffDelay(3, 100, 10000, 0.999), "backoff a3");
        eq(2500L, RetryBackoff.backoffDelay(10, 100, 10000, 0.25), "backoff a10");
        eq(0L, RetryBackoff.backoffDelay(3, 100, 10000, 0.0), "backoff a3zero");
        eq(5000L, RetryBackoff.backoffDelay(1000, 100, 10000, 0.5), "backoff huge attempt capped");
        long big = RetryBackoff.backoffDelay(62, 1L << 40, Long.MAX_VALUE, 0.5);
        check(big > 0 && big <= Long.MAX_VALUE / 2 + 1, "backoff no overflow near long max: " + big);
        eq(10000L * 9 / 10, RetryBackoff.backoffDelay(Integer.MAX_VALUE, 100, 10000, 0.9), "backoff max attempt capped");
        throwsIae(() -> RetryBackoff.backoffDelay(-1, 100, 10000, 0.5), "backoff negative attempt");
        throwsIae(() -> RetryBackoff.backoffDelay(0, 0, 10000, 0.5), "backoff zero base");
        throwsIae(() -> RetryBackoff.backoffDelay(0, 100, 99, 0.5), "backoff cap below base");
        throwsIae(() -> RetryBackoff.backoffDelay(0, 100, 10000, 1.0), "backoff fraction 1");
        throwsIae(() -> RetryBackoff.backoffDelay(0, 100, 10000, Double.NaN), "backoff fraction NaN");

        eq(120000L, RetryBackoff.retryAfterMs("120", 0), "retry_after secs");
        eq(30000L, RetryBackoff.retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000L), "retry_after date");
        eq(0L, RetryBackoff.retryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000L), "retry_after past");
        eq(0L, RetryBackoff.retryAfterMs("0", 5), "retry_after zero seconds");
        throwsIae(() -> RetryBackoff.retryAfterMs("-5", 0), "retry_after negative");
        throwsIae(() -> RetryBackoff.retryAfterMs("1.5", 0), "retry_after fractional");
        throwsIae(() -> RetryBackoff.retryAfterMs("soon", 0), "retry_after garbage");
        throwsIae(() -> RetryBackoff.retryAfterMs("", 0), "retry_after empty");
        throwsIae(() -> RetryBackoff.retryAfterMs("Thu, 21 Oct 2026 07:28:00 GMT", 0), "retry_after wrong weekday");
        throwsIae(() -> RetryBackoff.retryAfterMs("99999999999999999999", 0), "retry_after overflow");

        System.out.println("RetryBackoffTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
