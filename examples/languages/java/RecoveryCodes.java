// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** MFA recovery (backup) codes: Crockford-style base32 generation, normalization and keyed hashing. */
public final class RecoveryCodes {
    public static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    private RecoveryCodes() {}

    public static List<String> generateRecoveryCodes() { return generateRecoveryCodes(10, 2, 5); }

    public static List<String> generateRecoveryCodes(int count, int groups, int groupLength) {
        if (count < 1 || groups < 1 || groupLength < 1) throw new IllegalArgumentException("count, groups and groupLength must be positive");
        if (groups * groupLength < 8) throw new IllegalArgumentException("codes must have at least 8 symbols");
        SecureRandom random = new SecureRandom();
        Set<String> codes = new LinkedHashSet<>();
        while (codes.size() < count) {
            StringBuilder code = new StringBuilder();
            for (int g = 0; g < groups; g++) {
                if (g > 0) code.append('-');
                // 32-symbol alphabet: nextInt(32) is a uniform 5-bit draw, so selection is unbiased.
                for (int i = 0; i < groupLength; i++) code.append(ALPHABET.charAt(random.nextInt(32)));
            }
            codes.add(code.toString());
        }
        return new ArrayList<>(codes);
    }

    public static String normalizeRecoveryCode(String input) { return normalizeRecoveryCode(input, 2, 5); }

    public static String normalizeRecoveryCode(String input, int groups, int groupLength) {
        if (input == null) throw new IllegalArgumentException("recovery code is required");
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < input.length(); i++) {
            char c = Character.toUpperCase(input.charAt(i));
            if (c == ' ' || c == '-') continue;
            if (c == 'O') c = '0';
            else if (c == 'I' || c == 'L') c = '1';
            if (ALPHABET.indexOf(c) < 0) throw new IllegalArgumentException("invalid recovery code character");
            out.append(c);
        }
        if (out.length() != groups * groupLength) throw new IllegalArgumentException("recovery code has the wrong length");
        return out.toString();
    }

    public static String hashRecoveryCode(String code, byte[] key) {
        if (key == null || key.length == 0) throw new IllegalArgumentException("key must not be empty");
        byte[] mac;
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac = hmac.doFinal(normalizeRecoveryCode(code).getBytes(StandardCharsets.US_ASCII));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
        StringBuilder hex = new StringBuilder(mac.length * 2);
        for (byte b : mac) hex.append(Character.forDigit((b >> 4) & 15, 16)).append(Character.forDigit(b & 15, 16));
        return hex.toString();
    }

    /** Index of the matching stored hash, or -1. Compares against every hash without early exit. */
    public static int findRecoveryCode(String input, List<String> storedHashes, byte[] key) {
        byte[] candidate;
        try {
            candidate = hashRecoveryCode(input, key).getBytes(StandardCharsets.US_ASCII);
        } catch (IllegalArgumentException e) {
            if (key == null || key.length == 0) throw e;
            return -1;
        }
        int found = -1;
        for (int i = 0; i < storedHashes.size(); i++) {
            String stored = storedHashes.get(i);
            boolean equal = stored != null && MessageDigest.isEqual(candidate, stored.getBytes(StandardCharsets.US_ASCII));
            if (equal && found < 0) found = i;
        }
        return found;
    }
}
