// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Stripe-style webhook signatures: header "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.body")>". */
public final class WebhookSignature {
    /** Why a webhook was rejected. */
    public enum Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected webhook; the message starts with "malformed", "bad signature" or "expired". */
    public static final class WebhookException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        private final Kind kind;

        WebhookException(Kind kind, String message) { super(message); this.kind = kind; }

        public Kind kind() { return kind; }
    }

    public static final long DEFAULT_TOLERANCE_SECONDS = 300;
    private static final String HEX = "0123456789abcdef";

    private WebhookSignature() {}

    private static String hmacHex(String secret, long timestamp, String body) {
        if (secret == null || secret.isEmpty()) throw new IllegalArgumentException("secret must not be empty");
        if (body == null) throw new IllegalArgumentException("body is required");
        byte[] mac;
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac = m.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
        StringBuilder out = new StringBuilder(64);
        for (byte b : mac) out.append(HEX.charAt((b >> 4) & 0x0f)).append(HEX.charAt(b & 0x0f));
        return out.toString();
    }

    /** Signature header for body at timestampSeconds. */
    public static String signWebhook(String secret, long timestampSeconds, String body) {
        if (timestampSeconds < 0) throw new IllegalArgumentException("timestampSeconds must be >= 0");
        return "t=" + timestampSeconds + ",v1=" + hmacHex(secret, timestampSeconds, body);
    }

    private static WebhookException malformed(String why) { return new WebhookException(Kind.MALFORMED, "malformed: " + why); }

    public static void verifyWebhook(String header, String body, String secret, long nowSeconds) {
        verifyWebhook(header, body, secret, nowSeconds, DEFAULT_TOLERANCE_SECONDS);
    }

    /** Throws WebhookException (malformed, bad signature, expired) unless some v1 matches and t is within tolerance. */
    public static void verifyWebhook(String header, String body, String secret, long nowSeconds, long toleranceSeconds) {
        if (secret == null || secret.isEmpty()) throw new IllegalArgumentException("secret must not be empty");
        if (toleranceSeconds < 0) throw new IllegalArgumentException("toleranceSeconds must be >= 0");
        if (header == null) throw malformed("header is required");
        Long t = null;
        List<String> sigs = new ArrayList<>();
        for (String part : header.split(",", -1)) {
            int eq = part.indexOf('=');
            if (eq < 0) throw malformed("expected key=value pairs");
            String key = part.substring(0, eq).trim();
            String value = part.substring(eq + 1).trim();
            if (key.equals("t")) {
                if (t != null) throw malformed("more than one timestamp");
                if (!value.matches("[0-9]{1,18}")) throw malformed("timestamp must be decimal seconds");
                t = Long.parseLong(value);
            } else if (key.equals("v1")) {
                if (!value.matches("[0-9a-f]{64}")) throw malformed("v1 must be 64 lowercase hex characters");
                sigs.add(value);
            }
        }
        if (t == null) throw malformed("missing timestamp");
        if (sigs.isEmpty()) throw malformed("missing v1 signature");
        byte[] expected = hmacHex(secret, t, body).getBytes(StandardCharsets.US_ASCII);
        boolean match = false;
        for (String s : sigs) match |= MessageDigest.isEqual(expected, s.getBytes(StandardCharsets.US_ASCII));
        if (!match) throw new WebhookException(Kind.BAD_SIGNATURE, "bad signature");
        long diff;
        try { diff = Math.abs(Math.subtractExact(nowSeconds, t)); }
        catch (ArithmeticException e) { diff = Long.MAX_VALUE; }
        if (diff < 0 || diff > toleranceSeconds) throw new WebhookException(Kind.EXPIRED, "expired");
    }
}
