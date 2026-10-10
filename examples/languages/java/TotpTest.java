// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public final class TotpTest {
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

    private static byte[] ascii(String s) { return s.getBytes(StandardCharsets.US_ASCII); }

    public static void main(String[] args) {
        byte[] s1 = ascii("12345678901234567890");
        byte[] s256 = ascii("12345678901234567890123456789012");
        byte[] s512 = ascii("1234567890123456789012345678901234567890123456789012345678901234");
        String[] hotp = {"755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"};
        for (int i = 0; i < hotp.length; i++) eq(hotp[i], Totp.hotp(s1, i), "RFC 4226 counter " + i);

        long[] times = {59L, 1111111109L, 1111111111L, 1234567890L, 2000000000L, 20000000000L};
        String[][] expected = {
            {"94287082", "46119246", "90693936"}, {"07081804", "68084774", "25091201"},
            {"14050471", "67062674", "99943326"}, {"89005924", "91819424", "93441116"},
            {"69279037", "90698825", "38618901"}, {"65353130", "77737706", "47863826"}};
        for (int i = 0; i < times.length; i++) {
            eq(expected[i][0], Totp.totp(s1, times[i], 30, 8, "SHA1", 0), "RFC 6238 SHA1 t=" + times[i]);
            eq(expected[i][1], Totp.totp(s256, times[i], 30, 8, "SHA256", 0), "RFC 6238 SHA256 t=" + times[i]);
            eq(expected[i][2], Totp.totp(s512, times[i], 30, 8, "SHA512", 0), "RFC 6238 SHA512 t=" + times[i]);
        }

        eq("MZXW6YTBOI", Totp.base32Encode(ascii("foobar")), "base32 encode");
        check(Arrays.equals(ascii("foobar"), Totp.base32Decode("mzxw 6ytb-oi==")), "base32 decode lenient");
        throwsIae(() -> Totp.base32Decode("MZ1"), "base32 invalid char");
        byte[] random = Totp.generateSecret();
        check(Arrays.equals(random, Totp.base32Decode(Totp.base32Encode(random))), "base32 round trip");
        eq(20, random.length, "generateSecret default length");

        String code = Totp.totp(s1, 59, 30, 8, "SHA1", 0);
        check(Totp.verifyTotp(code, s1, 59, 1, 30, 8, "SHA1"), "verify same step");
        check(Totp.verifyTotp(code, s1, 89, 1, 30, 8, "SHA1"), "verify next step within window");
        check(!Totp.verifyTotp(code, s1, 150, 1, 30, 8, "SHA1"), "verify outside window");
        check(!Totp.verifyTotp("abc", s1, 59, 1, 30, 8, "SHA1"), "verify non-digit");
        check(!Totp.verifyTotp("1234567", s1, 59, 1, 30, 8, "SHA1"), "verify wrong length");

        eq("otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30",
            Totp.otpauthUri("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP"), "otpauth uri");
        throwsIae(() -> Totp.hotp(s1, 0, 6, "MD5"), "unsupported algorithm");

        System.out.println("TotpTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
