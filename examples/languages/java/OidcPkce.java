// SPDX-License-Identifier: Apache-2.0
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * OAuth 2.0 authorization code + PKCE (RFC 7636) and OpenID Connect request helpers.
 *
 * <p>Scope: this builds and checks the browser leg only (authorization URL, callback, token request body).
 * ID token and access token VERIFICATION must use a vetted library (see the Tier B cookbook). Never decode a
 * token to make an authentication or authorization decision with this code.
 */
public final class OidcPkce {
    private static final String UNRESERVED =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

    private OidcPkce() {}

    /** Error from the authorization callback; {@code error} is the OAuth error code or "state_mismatch". */
    public static final class CallbackException extends RuntimeException {
        private static final long serialVersionUID = 1L;
        private final String error;
        private final String errorDescription;

        public CallbackException(String error, String errorDescription) {
            super(errorDescription == null ? error : error + ": " + errorDescription);
            this.error = error;
            this.errorDescription = errorDescription;
        }

        public String error() { return error; }
        public String errorDescription() { return errorDescription; }
    }

    public record Callback(String code) {}

    public static String generateCodeVerifier() { return generateCodeVerifier(64); }

    public static String generateCodeVerifier(int length) {
        if (length < 43 || length > 128) throw new IllegalArgumentException("verifier length must be 43-128");
        SecureRandom random = new SecureRandom();
        StringBuilder out = new StringBuilder(length);
        for (int i = 0; i < length; i++) out.append(UNRESERVED.charAt(random.nextInt(UNRESERVED.length())));
        return out.toString();
    }

    public static String codeChallengeS256(String verifier) {
        if (verifier == null || verifier.isEmpty()) throw new IllegalArgumentException("verifier is required");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public static String randomToken() { return randomToken(32); }

    public static String randomToken(int bytes) {
        if (bytes < 16) throw new IllegalArgumentException("token must be at least 16 bytes");
        byte[] data = new byte[bytes];
        new SecureRandom().nextBytes(data);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
    }

    public static String buildAuthorizationUrl(String authorizationEndpoint, String clientId, String redirectUri,
                                               String scope, String state, String nonce, String codeChallenge,
                                               Map<String, String> extraParams) {
        URI endpoint = parse(authorizationEndpoint, "authorization endpoint");
        String scheme = endpoint.getScheme() == null ? "" : endpoint.getScheme().toLowerCase();
        String host = endpoint.getHost() == null ? "" : endpoint.getHost().toLowerCase();
        boolean loopback = scheme.equals("http") && (host.equals("localhost") || host.equals("127.0.0.1"));
        if (!scheme.equals("https") && !loopback)
            throw new IllegalArgumentException("authorization endpoint must use https (http only for localhost)");
        if (host.isEmpty()) throw new IllegalArgumentException("authorization endpoint must have a host");
        if (endpoint.getRawFragment() != null) throw new IllegalArgumentException("authorization endpoint must not have a fragment");
        requireText(clientId, "clientId");
        requireText(redirectUri, "redirectUri");
        requireText(state, "state");
        requireText(nonce, "nonce");
        requireText(codeChallenge, "codeChallenge");
        String scopes = scope == null ? "" : scope.trim().replaceAll("\\s+", " ");
        if (!List.of(scopes.split(" ")).contains("openid"))
            throw new IllegalArgumentException("scope must contain openid");

        StringBuilder url = new StringBuilder(authorizationEndpoint);
        String query = endpoint.getRawQuery();
        url.append(query == null ? "?" : query.isEmpty() ? "" : "&");
        url.append("response_type=code");
        appendParam(url, "client_id", clientId);
        appendParam(url, "redirect_uri", redirectUri);
        appendParam(url, "scope", scopes);
        appendParam(url, "state", state);
        appendParam(url, "nonce", nonce);
        appendParam(url, "code_challenge", codeChallenge);
        appendParam(url, "code_challenge_method", "S256");
        if (extraParams != null) {
            for (Map.Entry<String, String> e : extraParams.entrySet()) {
                requireText(e.getKey(), "extra parameter name");
                appendParam(url, e.getKey(), e.getValue() == null ? "" : e.getValue());
            }
        }
        return url.toString();
    }

    public static String buildAuthorizationUrl(String authorizationEndpoint, String clientId, String redirectUri,
                                               List<String> scope, String state, String nonce, String codeChallenge,
                                               Map<String, String> extraParams) {
        if (scope == null) throw new IllegalArgumentException("scope is required");
        return buildAuthorizationUrl(authorizationEndpoint, clientId, redirectUri, String.join(" ", scope), state,
                nonce, codeChallenge, extraParams);
    }

    /** Returns the code, or throws CallbackException for provider errors, missing code or state mismatch. */
    public static Callback parseCallback(String callbackUrl, String expectedState) {
        requireText(expectedState, "expectedState");
        URI uri = parse(callbackUrl, "callback URL");
        Map<String, String> params = new HashMap<>();
        String query = uri.getRawQuery();
        if (query != null && !query.isEmpty()) {
            for (String pair : query.split("&")) {
                if (pair.isEmpty()) continue;
                int eq = pair.indexOf('=');
                String key = decode(eq < 0 ? pair : pair.substring(0, eq));
                String value = eq < 0 ? "" : decode(pair.substring(eq + 1));
                if (params.put(key, value) != null) throw new CallbackException("invalid_request", "duplicate parameter " + key);
            }
        }
        if (params.containsKey("error")) throw new CallbackException(params.get("error"), params.get("error_description"));
        String code = params.get("code");
        if (code == null || code.isEmpty()) throw new CallbackException("missing_code", "callback has no code");
        String state = params.get("state");
        boolean stateOk = state != null && MessageDigest.isEqual(
                state.getBytes(StandardCharsets.UTF_8), expectedState.getBytes(StandardCharsets.UTF_8));
        if (!stateOk) throw new CallbackException("state_mismatch", "callback state does not match");
        return new Callback(code);
    }

    public static String tokenRequestBody(String code, String redirectUri, String clientId, String codeVerifier) {
        requireText(code, "code");
        requireText(redirectUri, "redirectUri");
        requireText(clientId, "clientId");
        requireText(codeVerifier, "codeVerifier");
        return "grant_type=authorization_code&code=" + form(code) + "&redirect_uri=" + form(redirectUri)
                + "&client_id=" + form(clientId) + "&code_verifier=" + form(codeVerifier);
    }

    private static void appendParam(StringBuilder url, String name, String value) {
        url.append('&').append(percentEncode(name)).append('=').append(percentEncode(value));
    }

    private static String percentEncode(String value) {
        StringBuilder out = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            if (UNRESERVED.indexOf(c) >= 0) out.append((char) c);
            else out.append(String.format("%%%02X", c));
        }
        return out.toString();
    }

    private static String form(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new CallbackException("invalid_request", "malformed percent-encoding");
        }
    }

    private static URI parse(String value, String what) {
        if (value == null) throw new IllegalArgumentException(what + " is required");
        try {
            return new URI(value);
        } catch (URISyntaxException e) {
            throw new IllegalArgumentException("invalid " + what, e);
        }
    }

    private static void requireText(String value, String name) {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException(name + " is required");
    }
}
