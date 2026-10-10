// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;

public final class RecoveryCodesTest {
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
        eq("7K3QX9MNP2", RecoveryCodes.normalizeRecoveryCode(" 7k3qx-9mnp2 "), "normalize spacing and case");
        eq("ABCDEFGH10", RecoveryCodes.normalizeRecoveryCode("ABCDE-FGHIO"), "normalize I/O mapping");
        throwsIae(() -> RecoveryCodes.normalizeRecoveryCode("ABCDE-FGHIU"), "normalize rejects U");
        throwsIae(() -> RecoveryCodes.normalizeRecoveryCode("ABC"), "normalize rejects length");

        byte[] key = "pepper".getBytes(StandardCharsets.US_ASCII);
        // Cross-checked with Python hmac.new(b'pepper', b'7K3QX9MNP2', hashlib.sha256).hexdigest().
        eq("b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138",
            RecoveryCodes.hashRecoveryCode("7K3QX-9MNP2", key), "hash vector");

        List<String> codes = RecoveryCodes.generateRecoveryCodes();
        eq(10, codes.size(), "generates 10 codes");
        eq(10, new HashSet<>(codes).size(), "codes are unique");
        boolean allMatch = true;
        for (String code : codes) allMatch &= code.matches("^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$");
        check(allMatch, "codes match format");

        List<String> hashes = List.of(RecoveryCodes.hashRecoveryCode(codes.get(0), key),
            RecoveryCodes.hashRecoveryCode(codes.get(1), key), RecoveryCodes.hashRecoveryCode(codes.get(2), key));
        eq(2, RecoveryCodes.findRecoveryCode(codes.get(2).toLowerCase(), hashes, key), "find index 2");
        eq(-1, RecoveryCodes.findRecoveryCode(codes.get(3), hashes, key), "unknown code not found");
        eq(-1, RecoveryCodes.findRecoveryCode("not a code", hashes, key), "malformed code not found");

        System.out.println("RecoveryCodesTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
