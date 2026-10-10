// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.util.List;

public final class SignedCursorsTest {
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

    private static void kind(SignedCursors.Kind expected, String token, byte[] secret, long now, String name) {
        try { SignedCursors.decodeCursor(token, secret, now); check(false, name + " did not throw"); }
        catch (SignedCursors.CursorException e) { check(e.kind() == expected, name + " expected " + expected + " got " + e.kind()); }
    }

    public static void main(String[] args) {
        byte[] secret = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII);
        List<String> values = List.of("2026-10-01T12:00:00Z", "42");
        String token = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc";
        eq(token, SignedCursors.encodeCursor(values, secret, 1790000000L), "encode vector cursor");
        eq(values, SignedCursors.decodeCursor(token, secret, 1789999999L), "decode before expiry");
        kind(SignedCursors.Kind.EXPIRED, token, secret, 1790000000L, "decode at expiry");
        String last = token.substring(token.length() - 1);
        for (String other : new String[] {"d", "A", "_"}) {
            if (other.equals(last)) continue;
            kind(SignedCursors.Kind.BAD_SIGNATURE, token.substring(0, token.length() - 1) + other, secret, 0, "tampered last char " + other);
        }
        kind(SignedCursors.Kind.BAD_SIGNATURE, token.replace(".T2z", ".U2z"), secret, 0, "tampered first signature char");
        kind(SignedCursors.Kind.MALFORMED, token.replace(".", ""), secret, 0, "no separator");
        kind(SignedCursors.Kind.MALFORMED, token + "=", secret, 0, "padding rejected");
        kind(SignedCursors.Kind.MALFORMED, "." + token.substring(token.indexOf('.') + 1), secret, 0, "empty body part");
        kind(SignedCursors.Kind.MALFORMED, token.substring(0, token.indexOf('.') + 1), secret, 0, "empty signature part");
        kind(SignedCursors.Kind.MALFORMED, token.replace("djEK", "dj+K"), secret, 0, "non-base64url character");
        byte[] other = "fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.US_ASCII);
        kind(SignedCursors.Kind.BAD_SIGNATURE, token, other, 0, "different secret");
        String v2 = SignedCursors.encodeCursor(List.of("x"), secret, 5).replace("djEK", "djIK");
        kind(SignedCursors.Kind.BAD_SIGNATURE, v2, secret, 0, "altered body breaks signature");
        byte[] short31 = "0123456789abcdef0123456789abcde".getBytes(StandardCharsets.US_ASCII);
        throwsIae(() -> SignedCursors.encodeCursor(values, short31, 1790000000L), "encode rejects 31-byte secret");
        throwsIae(() -> SignedCursors.decodeCursor(token, short31, 0), "decode rejects 31-byte secret");
        throwsIae(() -> SignedCursors.encodeCursor(List.of(), secret, 1), "encode empty values");
        throwsIae(() -> SignedCursors.encodeCursor(List.of("a\nb"), secret, 1), "encode newline value");
        throwsIae(() -> SignedCursors.encodeCursor(List.of("a"), secret, 0), "encode non-positive expiry");
        throwsIae(() -> SignedCursors.encodeCursor(java.util.Collections.nCopies(17, "a"), secret, 1), "encode 17 values");
        eq(List.of("a", ""), SignedCursors.decodeCursor(SignedCursors.encodeCursor(List.of("a", ""), secret, 9), secret, 8), "round trip empty value");

        System.out.println("SignedCursorsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
