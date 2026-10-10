// SPDX-License-Identifier: Apache-2.0

public final class IdsTest {
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

    private static byte[] fill(int value) {
        byte[] b = new byte[10];
        for (int i = 0; i < 10; i++) b[i] = (byte) value;
        return b;
    }

    public static void main(String[] args) {
        byte[] seq = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
        long ms = 1790000000123L;
        long max = (1L << 48) - 1;
        eq("01a0c450-6c7b-7102-8304-05060708090a", Ids.uuidV7(ms, seq), "uuid7 vector");
        eq("01M3250V3V041061050R3GG28A", Ids.ulid(ms, seq), "ulid vector");
        eq("00000000-0000-7000-8000-000000000000", Ids.uuidV7(0, fill(0)), "uuid7 zero vector");
        eq("7ZZZZZZZZZZZZZZZZZZZZZZZZZ", Ids.ulid(max, fill(0xff)), "ulid max time vector");

        eq(ms, Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090a"), "uuid7 time round trip");
        eq(ms, Ids.uuidV7Time("01A0C450-6C7B-7102-8304-05060708090A"), "uuid7 time upper case");
        eq(0L, Ids.uuidV7Time("00000000-0000-7000-8000-000000000000"), "uuid7 zero time");
        eq(ms, Ids.ulidTime("01M3250V3V041061050R3GG28A"), "ulid time round trip");
        eq(ms, Ids.ulidTime("01m3250v3v041061050r3gg28a"), "ulid time lower case");
        eq(max, Ids.ulidTime("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"), "ulid max time");

        throwsIae(() -> Ids.uuidV7(-1, seq), "uuid7 negative time");
        throwsIae(() -> Ids.uuidV7(max + 1, seq), "uuid7 time above 2^48-1");
        throwsIae(() -> Ids.ulid(0, new byte[9]), "ulid 9 random bytes");
        throwsIae(() -> Ids.ulid(0, null), "ulid null random");
        throwsIae(() -> Ids.uuidV7Time("01a0c450-6c7b-4102-8304-05060708090a"), "uuid version 4 rejected");
        throwsIae(() -> Ids.uuidV7Time("01a0c450-6c7b-7102-c304-05060708090a"), "uuid bad variant rejected");
        throwsIae(() -> Ids.uuidV7Time("01a0c4506c7b-7102-8304-05060708090a0"), "uuid misplaced dash");
        throwsIae(() -> Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090"), "uuid short");
        throwsIae(() -> Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090g"), "uuid non-hex");
        throwsIae(() -> Ids.ulidTime("81M3250V3V041061050R3GG28A"), "ulid first char above 7");
        throwsIae(() -> Ids.ulidTime("01M3250V3V041061050R3GG28U"), "ulid invalid char U");
        throwsIae(() -> Ids.ulidTime("01M3250V3V041061050R3GG28"), "ulid short");

        String u1 = Ids.newUuidV7();
        String u2 = Ids.newUuidV7();
        check(u1.matches("[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"), "newUuidV7 format " + u1);
        check(!u1.equals(u2), "newUuidV7 differs");
        Ids.uuidV7Time(u1);
        String l1 = Ids.newUlid();
        String l2 = Ids.newUlid();
        check(l1.matches("[0-7][0-9A-HJKMNP-TV-Z]{25}"), "newUlid format " + l1);
        check(!l1.equals(l2), "newUlid differs");
        check(Math.abs(Ids.ulidTime(l1) - System.currentTimeMillis()) < 60000, "newUlid uses the clock");

        System.out.println("IdsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
