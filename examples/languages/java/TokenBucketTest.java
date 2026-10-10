// SPDX-License-Identifier: Apache-2.0

public final class TokenBucketTest {
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
        // {now, cost, allowed (1/0), tokensMilli, retryAfterMs}
        long[][] steps = {
            {0, 1, 1, 4000, 0}, {0, 1, 1, 3000, 0}, {0, 1, 1, 2000, 0}, {0, 1, 1, 1000, 0}, {0, 1, 1, 0, 0},
            {0, 1, 0, 0, 500}, {250, 1, 0, 500, 250}, {500, 1, 1, 0, 0}, {500, 2, 0, 0, 1000}, {3000, 5, 1, 0, 0},
        };
        TokenBucket.State state = TokenBucket.newBucket(5, 0);
        eq(5000L, state.tokensMilli(), "new bucket starts full");
        for (int i = 0; i < steps.length; i++) {
            long[] s = steps[i];
            TokenBucket.Result r = TokenBucket.take(state, s[0], s[1], 5, 2);
            eq(s[2] == 1, r.allowed(), "step " + i + " allowed");
            eq(s[3], r.state().tokensMilli(), "step " + i + " tokensMilli");
            eq(s[4], r.retryAfterMs(), "step " + i + " retryAfterMs");
            state = r.state();
        }
        TokenBucket.State later = new TokenBucket.State(1000, 1000);
        TokenBucket.Result back = TokenBucket.take(later, 500, 1, 5, 2);
        eq(0L, back.state().tokensMilli(), "clock going backwards adds nothing");
        eq(1000L, back.state().lastMs(), "clock going backwards keeps lastMs");
        TokenBucket.Result huge = TokenBucket.take(new TokenBucket.State(0, Long.MIN_VALUE), Long.MAX_VALUE, 5, 5, Long.MAX_VALUE);
        check(huge.allowed() && huge.state().tokensMilli() == 0, "huge elapsed refills without overflow");
        throwsIae(() -> TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 6, 5, 2), "cost above capacity");
        throwsIae(() -> TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 0, 5, 2), "zero cost");
        throwsIae(() -> TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 1, 5, 0), "zero rate");
        throwsIae(() -> TokenBucket.newBucket(0, 0), "zero capacity");
        throwsIae(() -> TokenBucket.newBucket(Long.MAX_VALUE, 0), "capacity overflow");

        System.out.println("TokenBucketTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
