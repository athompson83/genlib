// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.Locale;

/** Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32), with deterministic builders. */
public final class Ids {
    private static final String CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final String HEX = "0123456789abcdef";
    private static final long MAX_MS = (1L << 48) - 1;
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {}

    private static void check(long unixMs, byte[] random10) {
        if (unixMs < 0 || unixMs > MAX_MS) throw new IllegalArgumentException("unixMs must be between 0 and 2^48-1");
        if (random10 == null || random10.length != 10) throw new IllegalArgumentException("random bytes must be exactly 10 bytes");
    }

    /** UUIDv7: 48-bit big-endian unixMs, then the 10 random bytes with version 7 and variant 0b10 applied. */
    public static String uuidV7(long unixMs, byte[] random10) {
        check(unixMs, random10);
        byte[] b = new byte[16];
        for (int i = 0; i < 6; i++) b[i] = (byte) (unixMs >>> (40 - 8 * i));
        System.arraycopy(random10, 0, b, 6, 10);
        b[6] = (byte) ((b[6] & 0x0f) | 0x70);
        b[8] = (byte) ((b[8] & 0x3f) | 0x80);
        StringBuilder out = new StringBuilder(36);
        for (int i = 0; i < 16; i++) {
            if (i == 4 || i == 6 || i == 8 || i == 10) out.append('-');
            out.append(HEX.charAt((b[i] >> 4) & 0x0f)).append(HEX.charAt(b[i] & 0x0f));
        }
        return out.toString();
    }

    /** ULID: (unixMs << 80) | random as a 128-bit big-endian integer in 26 Crockford base32 characters. */
    public static String ulid(long unixMs, byte[] random10) {
        check(unixMs, random10);
        BigInteger value = BigInteger.valueOf(unixMs).shiftLeft(80).or(new BigInteger(1, random10));
        char[] out = new char[26];
        for (int i = 25; i >= 0; i--) {
            out[i] = CROCKFORD.charAt(value.intValue() & 31);
            value = value.shiftRight(5);
        }
        return new String(out);
    }

    /** Returns the unixMs of a UUIDv7 (case-insensitive); rejects bad layout, version or variant. */
    public static long uuidV7Time(String text) {
        if (text == null || text.length() != 36) throw new IllegalArgumentException("UUID must be 36 characters");
        String s = text.toLowerCase(Locale.ROOT);
        for (int i = 0; i < 36; i++) {
            char c = s.charAt(i);
            boolean dash = i == 8 || i == 13 || i == 18 || i == 23;
            if (dash ? c != '-' : HEX.indexOf(c) < 0) throw new IllegalArgumentException("UUID has an invalid character at " + i);
        }
        if (s.charAt(14) != '7') throw new IllegalArgumentException("UUID is not version 7");
        if ("89ab".indexOf(s.charAt(19)) < 0) throw new IllegalArgumentException("UUID variant must be RFC 9562 (10xx)");
        return Long.parseLong(s.substring(0, 8) + s.substring(9, 13), 16);
    }

    /** Returns the unixMs of a ULID (case-insensitive); rejects bad length, characters or a first char above '7'. */
    public static long ulidTime(String text) {
        if (text == null || text.length() != 26) throw new IllegalArgumentException("ULID must be 26 characters");
        String s = text.toUpperCase(Locale.ROOT);
        long ms = 0;
        for (int i = 0; i < 26; i++) {
            int v = CROCKFORD.indexOf(s.charAt(i));
            if (v < 0) throw new IllegalArgumentException("ULID has an invalid character at " + i);
            if (i == 0 && v > 7) throw new IllegalArgumentException("ULID overflows 128 bits");
            if (i < 10) ms = (ms << 5) | v;
        }
        return ms;
    }

    private static byte[] random10() {
        byte[] r = new byte[10];
        RANDOM.nextBytes(r);
        return r;
    }

    /** A new UUIDv7 from the system clock and SecureRandom. */
    public static String newUuidV7() { return uuidV7(System.currentTimeMillis(), random10()); }

    /** A new ULID from the system clock and SecureRandom. */
    public static String newUlid() { return ulid(System.currentTimeMillis(), random10()); }
}
