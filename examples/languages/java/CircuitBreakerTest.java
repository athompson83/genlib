// SPDX-License-Identifier: Apache-2.0

public final class CircuitBreakerTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void near(double expected, double actual, double tol, String name) {
        check(Math.abs(expected - actual) <= tol, name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void nearAll(double[] expected, double[] actual, double tol, String name) {
        check(expected.length == actual.length, name + " length");
        for (int i = 0; i < Math.min(expected.length, actual.length); i++) near(expected[i], actual[i], tol, name + "[" + i + "]");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        CircuitBreaker b0 = new CircuitBreaker(2, 1000, 1);
        eq(true, b0.allow(0), "script 0 step 0 allow@0");
        b0.recordFailure(0);
        eq("closed", b0.state(0), "script 0 step 2 state@0");
        b0.recordFailure(10);
        eq("open", b0.state(10), "script 0 step 4 state@10");
        eq(false, b0.allow(500), "script 0 step 5 allow@500");
        eq(510L, b0.retryAfterMs(500), "script 0 step 6 retry_after@500");
        eq("half_open", b0.state(1010), "script 0 step 7 state@1010");
        eq(true, b0.allow(1010), "script 0 step 8 allow@1010");
        eq(false, b0.allow(1011), "script 0 step 9 allow@1011");
        b0.recordSuccess(1020);
        eq("closed", b0.state(1020), "script 0 step 11 state@1020");
        eq(true, b0.allow(1021), "script 0 step 12 allow@1021");
        CircuitBreaker b1 = new CircuitBreaker(3, 500, 2);
        b1.recordFailure(0);
        b1.recordSuccess(1);
        b1.recordFailure(2);
        b1.recordFailure(3);
        eq("closed", b1.state(3), "script 1 step 4 state@3");
        b1.recordFailure(4);
        eq("open", b1.state(4), "script 1 step 6 state@4");
        eq("open", b1.state(503), "script 1 step 7 state@503");
        eq(true, b1.allow(504), "script 1 step 8 allow@504");
        eq(true, b1.allow(505), "script 1 step 9 allow@505");
        eq(false, b1.allow(506), "script 1 step 10 allow@506");
        b1.recordFailure(507);
        eq("open", b1.state(507), "script 1 step 12 state@507");
        eq(407L, b1.retryAfterMs(600), "script 1 step 13 retry_after@600");
        eq("half_open", b1.state(1007), "script 1 step 14 state@1007");
        eq(true, b1.allow(1008), "script 1 step 15 allow@1008");
        b1.recordSuccess(1009);
        eq("closed", b1.state(1009), "script 1 step 17 state@1009");
        CircuitBreaker b2 = new CircuitBreaker(1, 0, 1);
        b2.recordFailure(5);
        eq("half_open", b2.state(5), "script 2 step 1 state@5");
        eq(true, b2.allow(5), "script 2 step 2 allow@5");
        eq(false, b2.allow(5), "script 2 step 3 allow@5");
        b2.recordFailure(6);
        eq("half_open", b2.state(6), "script 2 step 5 state@6");
        eq(true, b2.allow(6), "script 2 step 6 allow@6");
        CircuitBreaker d = new CircuitBreaker();
        for (int i = 0; i < 4; i++) d.recordFailure(i);
        eq("closed", d.state(4), "default threshold 5: closed after 4");
        d.recordFailure(5);
        eq(30000L, d.retryAfterMs(5), "default cooldown 30000");
        throwsIae(() -> new CircuitBreaker(0, 1000, 1), "invalid 0");
        throwsIae(() -> new CircuitBreaker(1, -1, 1), "invalid 1");
        throwsIae(() -> new CircuitBreaker(1, 1000, 0), "invalid 2");

        System.out.println("CircuitBreakerTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
