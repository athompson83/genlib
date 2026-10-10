// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords, Base32 secrets and otpauth URIs. */
public final class Totp {
    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    private Totp() {}

    public static String hotp(byte[] secret, long counter) { return hotp(secret, counter, 6, "SHA1"); }

    public static String hotp(byte[] secret, long counter, int digits, String algorithm) {
        if (secret == null || secret.length == 0) throw new IllegalArgumentException("secret must not be empty");
        if (digits < 1 || digits > 10) throw new IllegalArgumentException("digits must be between 1 and 10");
        byte[] message = new byte[8];
        long c = counter;
        for (int i = 7; i >= 0; i--) { message[i] = (byte) c; c >>>= 8; }
        byte[] hash;
        try {
            Mac mac = Mac.getInstance(macName(algorithm));
            mac.init(new SecretKeySpec(secret, mac.getAlgorithm()));
            hash = mac.doFinal(message);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC unavailable", e);
        }
        int offset = hash[hash.length - 1] & 0x0f;
        long binary = ((hash[offset] & 0x7fL) << 24) | ((hash[offset + 1] & 0xffL) << 16)
                | ((hash[offset + 2] & 0xffL) << 8) | (hash[offset + 3] & 0xffL);
        long modulus = 1;
        for (int i = 0; i < digits; i++) modulus *= 10;
        StringBuilder code = new StringBuilder(Long.toString(binary % modulus));
        while (code.length() < digits) code.insert(0, '0');
        return code.toString();
    }

    public static String totp(byte[] secret, long unixSeconds) { return totp(secret, unixSeconds, 30, 6, "SHA1", 0); }

    public static String totp(byte[] secret, long unixSeconds, int step, int digits, String algorithm, long t0) {
        return hotp(secret, counterFor(unixSeconds, step, t0), digits, algorithm);
    }

    public static boolean verifyTotp(String code, byte[] secret, long unixSeconds) {
        return verifyTotp(code, secret, unixSeconds, 1, 30, 6, "SHA1");
    }

    public static boolean verifyTotp(String code, byte[] secret, long unixSeconds, int window, int step, int digits,
                                     String algorithm) {
        if (window < 0) throw new IllegalArgumentException("window must be >= 0");
        if (code == null || code.length() != digits) return false;
        for (int i = 0; i < code.length(); i++) {
            char ch = code.charAt(i);
            if (ch < '0' || ch > '9') return false;
        }
        byte[] given = code.getBytes(StandardCharsets.US_ASCII);
        long current = counterFor(unixSeconds, step, 0);
        boolean match = false;
        for (long offset = -window; offset <= window; offset++) {
            long counter = current + offset;
            if (counter < 0) continue;
            byte[] expected = hotp(secret, counter, digits, algorithm).getBytes(StandardCharsets.US_ASCII);
            match |= MessageDigest.isEqual(expected, given);
        }
        return match;
    }

    public static String base32Encode(byte[] data) {
        StringBuilder out = new StringBuilder((data.length * 8 + 4) / 5);
        int buffer = 0;
        int bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                out.append(BASE32.charAt((buffer >>> (bits - 5)) & 31));
                bits -= 5;
            }
        }
        if (bits > 0) out.append(BASE32.charAt((buffer << (5 - bits)) & 31));
        return out.toString();
    }

    public static byte[] base32Decode(String text) {
        if (text == null) throw new IllegalArgumentException("base32 input must not be null");
        String s = text.replace(" ", "").replace("-", "");
        int end = s.length();
        while (end > 0 && s.charAt(end - 1) == '=') end--;
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        int buffer = 0;
        int bits = 0;
        for (int i = 0; i < end; i++) {
            int value = BASE32.indexOf(Character.toUpperCase(s.charAt(i)));
            if (value < 0) throw new IllegalArgumentException("invalid base32 character at index " + i);
            buffer = (buffer << 5) | value;
            bits += 5;
            if (bits >= 8) {
                out.write((buffer >>> (bits - 8)) & 0xff);
                bits -= 8;
            }
        }
        return out.toByteArray();
    }

    public static String otpauthUri(String issuer, String account, String secretBase32) {
        return otpauthUri(issuer, account, secretBase32, 6, 30, "SHA1");
    }

    public static String otpauthUri(String issuer, String account, String secretBase32, int digits, int period,
                                    String algorithm) {
        if (issuer == null || issuer.isEmpty() || account == null || account.isEmpty())
            throw new IllegalArgumentException("issuer and account are required");
        base32Decode(secretBase32);
        macName(algorithm);
        String enc = percentEncode(issuer);
        return "otpauth://totp/" + enc + ":" + percentEncode(account) + "?secret=" + secretBase32
                + "&issuer=" + enc + "&algorithm=" + algorithm + "&digits=" + digits + "&period=" + period;
    }

    public static byte[] generateSecret() { return generateSecret(20); }

    public static byte[] generateSecret(int bytes) {
        if (bytes < 1) throw new IllegalArgumentException("bytes must be positive");
        byte[] secret = new byte[bytes];
        new SecureRandom().nextBytes(secret);
        return secret;
    }

    private static long counterFor(long unixSeconds, int step, long t0) {
        if (step <= 0) throw new IllegalArgumentException("step must be positive");
        long counter = Math.floorDiv(unixSeconds - t0, (long) step);
        if (counter < 0) throw new IllegalArgumentException("time is before t0");
        return counter;
    }

    private static String macName(String algorithm) {
        if ("SHA1".equals(algorithm)) return "HmacSHA1";
        if ("SHA256".equals(algorithm)) return "HmacSHA256";
        if ("SHA512".equals(algorithm)) return "HmacSHA512";
        throw new IllegalArgumentException("unsupported algorithm: " + algorithm);
    }

    /** RFC 3986 percent-encoding: unreserved characters stay, everything else is %XX of UTF-8. */
    private static String percentEncode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            if (c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9'
                    || c == '-' || c == '.' || c == '_' || c == '~') {
                out.append((char) c);
            } else {
                out.append('%').append(Character.toUpperCase(Character.forDigit(c >> 4, 16)))
                        .append(Character.toUpperCase(Character.forDigit(c & 15, 16)));
            }
        }
        return out.toString();
    }
}
