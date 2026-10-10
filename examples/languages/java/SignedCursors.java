// SPDX-License-Identifier: Apache-2.0
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** HMAC-SHA256 signed, expiring pagination cursors: base64url(body) "." base64url(mac), unpadded. */
public final class SignedCursors {
    /** Why a cursor was rejected. */
    public enum Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected cursor; the message starts with "malformed", "bad signature" or "expired". */
    public static final class CursorException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        private final Kind kind;

        CursorException(Kind kind, String message) { super(message); this.kind = kind; }

        public Kind kind() { return kind; }
    }

    private SignedCursors() {}

    private static void checkSecret(byte[] secret) {
        if (secret == null || secret.length < 32) throw new IllegalArgumentException("secret must be at least 32 bytes");
    }

    private static byte[] hmac(byte[] secret, byte[] body) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret, "HmacSHA256"));
            return mac.doFinal(body);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String b64(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }

    /** Signs 1 to 16 values (no newlines) that expire at expiresAt (unix seconds). */
    public static String encodeCursor(List<String> values, byte[] secret, long expiresAt) {
        checkSecret(secret);
        if (values == null || values.isEmpty() || values.size() > 16) throw new IllegalArgumentException("values must hold 1 to 16 entries");
        for (String v : values)
            if (v == null || v.indexOf('\n') >= 0) throw new IllegalArgumentException("values must be non-null and contain no newline");
        if (expiresAt <= 0) throw new IllegalArgumentException("expiresAt must be positive");
        byte[] body = ("v1\n" + expiresAt + "\n" + String.join("\n", values)).getBytes(StandardCharsets.UTF_8);
        return b64(body) + "." + b64(hmac(secret, body));
    }

    private static byte[] decodePart(String part, boolean canonical) {
        if (part.isEmpty()) throw new CursorException(Kind.MALFORMED, "malformed: empty cursor part");
        for (int i = 0; i < part.length(); i++) {
            char c = part.charAt(i);
            boolean ok = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_';
            if (!ok) throw new CursorException(Kind.MALFORMED, "malformed: invalid base64url character");
        }
        byte[] out;
        try { out = Base64.getUrlDecoder().decode(part); }
        catch (IllegalArgumentException e) { throw new CursorException(Kind.MALFORMED, "malformed: invalid base64url length"); }
        if (canonical && !b64(out).equals(part)) throw new CursorException(Kind.MALFORMED, "malformed: non-canonical base64url");
        return out;
    }

    /** Verifies and returns the values; throws CursorException (malformed, bad signature, expired). */
    public static List<String> decodeCursor(String token, byte[] secret, long now) {
        checkSecret(secret);
        if (token == null) throw new CursorException(Kind.MALFORMED, "malformed: token is required");
        int dot = token.lastIndexOf('.');
        if (dot < 0) throw new CursorException(Kind.MALFORMED, "malformed: missing signature separator");
        byte[] body = decodePart(token.substring(0, dot), true);
        String sig = token.substring(dot + 1);
        decodePart(sig, false);
        // Compare the encoded form so a change in the unused trailing bits of the last character is still rejected.
        byte[] expected = b64(hmac(secret, body)).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, sig.getBytes(StandardCharsets.US_ASCII))) throw new CursorException(Kind.BAD_SIGNATURE, "bad signature");
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(body)).toString();
        } catch (CharacterCodingException e) {
            throw new CursorException(Kind.MALFORMED, "malformed: body is not UTF-8");
        }
        String[] parts = text.split("\n", -1);
        if (parts.length < 3 || !parts[0].equals("v1") || !parts[1].matches("[0-9]{1,18}"))
            throw new CursorException(Kind.MALFORMED, "malformed: bad header");
        if (now >= Long.parseLong(parts[1])) throw new CursorException(Kind.EXPIRED, "expired");
        return List.copyOf(Arrays.asList(parts).subList(2, parts.length));
    }
}
