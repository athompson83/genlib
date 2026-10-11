// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

/**
 * Base58 with the Bitcoin alphabet and Base58Check (payload plus the first 4 bytes of a double SHA-256).
 * The big-number conversion works on byte arrays. Every failure throws IllegalArgumentException.
 */
public final class Base58 {
    private static final String ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    private Base58() {}

    /** Encodes bytes; each leading zero byte becomes a leading '1'. */
    public static String base58Encode(byte[] bytes) {
        int zeros = 0;
        while (zeros < bytes.length && bytes[zeros] == 0) zeros++;
        byte[] num = Arrays.copyOfRange(bytes, zeros, bytes.length);
        StringBuilder out = new StringBuilder();
        int start = 0;
        while (start < num.length) {
            int rem = 0;
            for (int i = start; i < num.length; i++) {
                int acc = rem * 256 + (num[i] & 0xFF);
                num[i] = (byte) (acc / 58);
                rem = acc % 58;
            }
            out.append(ALPHABET.charAt(rem));
            while (start < num.length && num[start] == 0) start++;
        }
        for (int i = 0; i < zeros; i++) out.append('1');
        return out.reverse().toString();
    }

    /** Decodes Base58 text; a character outside the alphabet throws, and "" gives an empty array. */
    public static byte[] base58Decode(String s) {
        int ones = 0;
        while (ones < s.length() && s.charAt(ones) == '1') ones++;
        byte[] num = new byte[0];
        for (int k = 0; k < s.length(); k++) {
            int d = ALPHABET.indexOf(s.charAt(k));
            if (d < 0) throw new IllegalArgumentException("invalid base58 character");
            int carry = d;
            for (int i = num.length - 1; i >= 0; i--) {
                int acc = (num[i] & 0xFF) * 58 + carry;
                num[i] = (byte) acc;
                carry = acc >> 8;
            }
            while (carry > 0) {
                byte[] grown = new byte[num.length + 1];
                System.arraycopy(num, 0, grown, 1, num.length);
                grown[0] = (byte) carry;
                carry >>= 8;
                num = grown;
            }
        }
        int lead = 0;
        while (lead < num.length && num[lead] == 0) lead++;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        for (int i = 0; i < ones; i++) out.write(0);
        out.write(num, lead, num.length - lead);
        return out.toByteArray();
    }

    private static byte[] checksum(byte[] payload) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] once = md.digest(payload);
            return Arrays.copyOf(md.digest(once), 4);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Base58Check: encodes payload followed by its 4-byte double-SHA-256 checksum. */
    public static String base58CheckEncode(byte[] payload) {
        byte[] all = Arrays.copyOf(payload, payload.length + 4);
        System.arraycopy(checksum(payload), 0, all, payload.length, 4);
        return base58Encode(all);
    }

    /** Base58Check: decodes, verifies the 4-byte checksum and returns the payload. */
    public static byte[] base58CheckDecode(String s) {
        byte[] b = base58Decode(s);
        if (b.length < 4) throw new IllegalArgumentException("too short for a checksum");
        byte[] payload = Arrays.copyOf(b, b.length - 4);
        if (!MessageDigest.isEqual(checksum(payload), Arrays.copyOfRange(b, b.length - 4, b.length))) {
            throw new IllegalArgumentException("checksum mismatch");
        }
        return payload;
    }
}
