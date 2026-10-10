// SPDX-License-Identifier: Apache-2.0
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.Locale;

/** Strict base32 (RFC 4648 sections 6 and 7), Bitcoin base58 and unpadded base64url (RFC 4648 section 5). */
public final class BaseEncodings {
    private static final String B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final String B32HEX = "0123456789ABCDEFGHIJKLMNOPQRSTUV";
    private static final String B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private static final String B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    private static final BigInteger FIFTY_EIGHT = BigInteger.valueOf(58);

    private BaseEncodings() {}

    private static String alphabet(String name) {
        if ("rfc4648".equals(name)) return B32;
        if ("hex".equals(name)) return B32HEX;
        throw new IllegalArgumentException("base32 alphabet must be rfc4648 or hex");
    }

    public static String base32Encode(byte[] data) { return base32Encode(data, "rfc4648", true); }

    /** Uppercase base32; alphabet is "rfc4648" or "hex"; padding adds "=" to a multiple of 8 characters. */
    public static String base32Encode(byte[] data, String alphabet, boolean padding) {
        String a = alphabet(alphabet);
        StringBuilder out = new StringBuilder();
        int bits = 0;
        int n = 0;
        for (byte b : data) {
            bits = (bits << 8) | (b & 0xff);
            n += 8;
            while (n >= 5) { n -= 5; out.append(a.charAt((bits >>> n) & 31)); }
            bits &= (1 << n) - 1;
        }
        if (n > 0) out.append(a.charAt((bits << (5 - n)) & 31));
        if (padding) while (out.length() % 8 != 0) out.append('=');
        return out.toString();
    }

    public static byte[] base32Decode(String text) { return base32Decode(text, "rfc4648", true); }

    /** Case-insensitive strict decode; throws IllegalArgumentException for bad length, padding, characters or non-zero leftover bits. */
    public static byte[] base32Decode(String text, String alphabet, boolean padding) {
        String a = alphabet(alphabet);
        String t = text.toUpperCase(Locale.ROOT);
        if (padding) {
            if (t.length() % 8 != 0) throw new IllegalArgumentException("base32 length must be a multiple of 8");
            int end = t.length();
            while (end > 0 && t.charAt(end - 1) == '=') end--;
            int pad = t.length() - end;
            if (pad != 0 && pad != 1 && pad != 3 && pad != 4 && pad != 6) throw new IllegalArgumentException("invalid base32 padding");
            t = t.substring(0, end);
        } else if (t.indexOf('=') >= 0) {
            throw new IllegalArgumentException("unexpected base32 padding");
        }
        int rem = t.length() % 8;
        if (rem == 1 || rem == 3 || rem == 6) throw new IllegalArgumentException("invalid base32 length");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int bits = 0;
        int n = 0;
        for (int i = 0; i < t.length(); i++) {
            int v = a.indexOf(t.charAt(i));
            if (v < 0) throw new IllegalArgumentException("invalid base32 character");
            bits = (bits << 5) | v;
            n += 5;
            if (n >= 8) { n -= 8; out.write((bits >>> n) & 0xff); }
            bits &= (1 << n) - 1;
        }
        if (bits != 0) throw new IllegalArgumentException("non-canonical base32 (non-zero trailing bits)");
        return out.toByteArray();
    }

    /** Bitcoin-alphabet base58; each leading zero byte becomes one leading "1". */
    public static String base58Encode(byte[] data) {
        int zeros = 0;
        while (zeros < data.length && data[zeros] == 0) zeros++;
        BigInteger n = new BigInteger(1, data);
        StringBuilder s = new StringBuilder();
        while (n.signum() > 0) {
            BigInteger[] qr = n.divideAndRemainder(FIFTY_EIGHT);
            s.append(B58.charAt(qr[1].intValue()));
            n = qr[0];
        }
        for (int i = 0; i < zeros; i++) s.append('1');
        return s.reverse().toString();
    }

    /** Decodes base58; throws IllegalArgumentException for characters outside the Bitcoin alphabet (0, O, I, l, ...). */
    public static byte[] base58Decode(String text) {
        BigInteger n = BigInteger.ZERO;
        for (int i = 0; i < text.length(); i++) {
            int v = B58.indexOf(text.charAt(i));
            if (v < 0) throw new IllegalArgumentException("invalid base58 character");
            n = n.multiply(FIFTY_EIGHT).add(BigInteger.valueOf(v));
        }
        int zeros = 0;
        while (zeros < text.length() && text.charAt(zeros) == '1') zeros++;
        byte[] body = n.signum() == 0 ? new byte[0] : n.toByteArray();
        int skip = body.length > 1 && body[0] == 0 ? 1 : 0;
        byte[] out = new byte[zeros + body.length - skip];
        System.arraycopy(body, skip, out, zeros, body.length - skip);
        return out;
    }

    /** Unpadded URL-safe base64. */
    public static String base64UrlEncode(byte[] data) {
        StringBuilder out = new StringBuilder();
        int bits = 0;
        int n = 0;
        for (byte b : data) {
            bits = (bits << 8) | (b & 0xff);
            n += 8;
            while (n >= 6) { n -= 6; out.append(B64U.charAt((bits >>> n) & 63)); }
            bits &= (1 << n) - 1;
        }
        if (n > 0) out.append(B64U.charAt((bits << (6 - n)) & 63));
        return out.toString();
    }

    /** Strict decode: rejects "=", "+", "/", other characters, length mod 4 == 1 and non-zero trailing bits. */
    public static byte[] base64UrlDecode(String text) {
        if (text.length() % 4 == 1) throw new IllegalArgumentException("invalid base64url length");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int bits = 0;
        int n = 0;
        for (int i = 0; i < text.length(); i++) {
            int v = B64U.indexOf(text.charAt(i));
            if (v < 0) throw new IllegalArgumentException("invalid base64url character");
            bits = (bits << 6) | v;
            n += 6;
            if (n >= 8) { n -= 8; out.write((bits >>> n) & 0xff); }
            bits &= (1 << n) - 1;
        }
        if (bits != 0) throw new IllegalArgumentException("non-canonical base64url (non-zero trailing bits)");
        return out.toByteArray();
    }
}
