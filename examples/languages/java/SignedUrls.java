// SPDX-License-Identifier: Apache-2.0
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Expiring signed URLs: "target?...&expires=<unix seconds>&signature=<base64url HMAC-SHA256 without padding>". */
public final class SignedUrls {
    /** Why a signed URL was rejected. */
    public enum Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected URL; the message starts with "malformed", "bad signature" or "expired". */
    public static final class SignedUrlException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        private final Kind kind;

        SignedUrlException(Kind kind, String message) { super(message); this.kind = kind; }

        public Kind kind() { return kind; }
    }

    private static final String SIG = "&signature=";

    private SignedUrls() {}

    private static String mac(String secret, String message) {
        if (secret == null || secret.isEmpty()) throw new IllegalArgumentException("secret must not be empty");
        try {
            Mac m = Mac.getInstance("HmacSHA256");
            m.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    private static String paramName(String pair) {
        int eq = pair.indexOf('=');
        return eq < 0 ? pair : pair.substring(0, eq);
    }

    /** Signs a path (plus optional query) starting with "/" so it is valid until expiresUnixSeconds inclusive. */
    public static String signUrl(String target, String secret, long expiresUnixSeconds) {
        if (target == null || !target.startsWith("/")) throw new IllegalArgumentException("target must start with \"/\"");
        if (target.indexOf('#') >= 0) throw new IllegalArgumentException("target must not contain a fragment");
        if (expiresUnixSeconds < 0) throw new IllegalArgumentException("expiresUnixSeconds must be >= 0");
        if (secret == null || secret.isEmpty()) throw new IllegalArgumentException("secret must not be empty");
        int q = target.indexOf('?');
        if (q >= 0) {
            for (String pair : target.substring(q + 1).split("&", -1)) {
                String name = paramName(pair);
                if (name.equals("expires") || name.equals("signature")) throw new IllegalArgumentException("target already has a \"" + name + "\" parameter");
            }
        }
        String message = target + (q >= 0 ? "&" : "?") + "expires=" + expiresUnixSeconds;
        return message + SIG + mac(secret, message);
    }

    private static SignedUrlException malformed(String why) { return new SignedUrlException(Kind.MALFORMED, "malformed: " + why); }

    /** Throws SignedUrlException (malformed, bad signature, expired) unless the URL is authentic and now <= expires. */
    public static void verifyUrl(String signed, String secret, long nowUnixSeconds) {
        if (secret == null || secret.isEmpty()) throw new IllegalArgumentException("secret must not be empty");
        if (signed == null) throw malformed("url is required");
        int at = signed.lastIndexOf(SIG);
        if (at < 0) throw malformed("missing signature");
        String sig = signed.substring(at + SIG.length());
        if (!sig.matches("[A-Za-z0-9_-]{43}")) throw malformed("signature must be 43 base64url characters at the end");
        String message = signed.substring(0, at);
        int q = message.indexOf('?');
        if (q < 0) throw malformed("missing expires");
        String expires = null;
        int count = 0;
        for (String pair : message.substring(q + 1).split("&", -1)) {
            if (paramName(pair).equals("expires")) {
                count++;
                expires = pair.indexOf('=') < 0 ? "" : pair.substring(pair.indexOf('=') + 1);
            }
        }
        if (count != 1) throw malformed("expected exactly one expires parameter");
        if (!expires.matches("[0-9]{1,18}")) throw malformed("expires must be decimal seconds");
        byte[] expected = mac(secret, message).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(expected, sig.getBytes(StandardCharsets.US_ASCII))) throw new SignedUrlException(Kind.BAD_SIGNATURE, "bad signature");
        if (nowUnixSeconds > Long.parseLong(expires)) throw new SignedUrlException(Kind.EXPIRED, "expired");
    }
}
