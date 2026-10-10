// SPDX-License-Identifier: Apache-2.0
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class OidcPkceTest {
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

    private static OidcPkce.CallbackException callbackError(String url, String state) {
        try { OidcPkce.parseCallback(url, state); return null; }
        catch (OidcPkce.CallbackException e) { return e; }
    }

    public static void main(String[] args) {
        String challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        eq(challenge, OidcPkce.codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "RFC 7636 challenge");

        eq("https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
            OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize", "app 1", "https://app.example.com/cb",
                List.of("openid", "email"), "s1", "n1", challenge, null), "authorization url");
        throwsIae(() -> OidcPkce.buildAuthorizationUrl("http://id.example.com/authorize", "app", "https://app.example.com/cb",
            "openid", "s1", "n1", challenge, null), "plain http endpoint rejected");
        check(OidcPkce.buildAuthorizationUrl("http://localhost:8080/authorize", "app", "http://localhost:8080/cb",
            "openid", "s1", "n1", challenge, null).startsWith("http://localhost:8080/authorize?response_type=code&"),
            "localhost endpoint accepted");
        Map<String, String> extra = new LinkedHashMap<>();
        extra.put("prompt", "login");
        extra.put("login_hint", "a@b.co");
        eq("https://id.example.com/authorize?tenant=a&response_type=code&client_id=app&redirect_uri=x&scope=openid&state=s&nonce=n&code_challenge=c&code_challenge_method=S256&prompt=login&login_hint=a%40b.co",
            OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize?tenant=a", "app", "x", "openid", "s", "n", "c",
                extra),
            "existing query preserved and extra params ordered");
        throwsIae(() -> OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize", "app", "x", "email", "s", "n", "c", null),
            "scope without openid rejected");

        eq("abc", OidcPkce.parseCallback("https://app.example.com/cb?code=abc&state=s1", "s1").code(), "callback code");
        OidcPkce.CallbackException mismatch = callbackError("https://app.example.com/cb?code=abc&state=s1", "s2");
        check(mismatch != null && mismatch.error().equals("state_mismatch"), "state mismatch");
        OidcPkce.CallbackException denied = callbackError(
            "https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1");
        check(denied != null && denied.error().equals("access_denied") && "User denied".equals(denied.errorDescription()),
            "provider error surfaced");
        OidcPkce.CallbackException missing = callbackError("https://app.example.com/cb?state=s1", "s1");
        check(missing != null && missing.error().equals("missing_code"), "missing code");

        eq("grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v",
            OidcPkce.tokenRequestBody("c d", "https://app.example.com/cb", "app", "v"), "token request body");

        String verifier = OidcPkce.generateCodeVerifier();
        eq(64, verifier.length(), "verifier default length");
        check(verifier.matches("[A-Za-z0-9._~-]+"), "verifier unreserved chars");
        throwsIae(() -> OidcPkce.generateCodeVerifier(42), "verifier length 42 rejected");
        throwsIae(() -> OidcPkce.generateCodeVerifier(129), "verifier length 129 rejected");
        String token = OidcPkce.randomToken();
        check(token.length() == 43 && token.matches("[A-Za-z0-9_-]+"), "random token base64url without padding");

        System.out.println("OidcPkceTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
