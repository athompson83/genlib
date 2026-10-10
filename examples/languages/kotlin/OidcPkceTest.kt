// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun callbackError(url: String, state: String): OidcPkce.CallbackException? =
    try { OidcPkce.parseCallback(url, state); null } catch (e: OidcPkce.CallbackException) { e }

fun main() {
    val challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    eq(challenge, OidcPkce.codeChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "RFC 7636 challenge")

    eq(
        "https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256",
        OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize", "app 1", "https://app.example.com/cb",
            listOf("openid", "email"), "s1", "n1", challenge),
        "authorization url",
    )
    throwsIae("plain http endpoint rejected") {
        OidcPkce.buildAuthorizationUrl("http://id.example.com/authorize", "app", "https://app.example.com/cb", "openid", "s1", "n1", challenge)
    }
    check(
        OidcPkce.buildAuthorizationUrl("http://localhost:8080/authorize", "app", "http://localhost:8080/cb", "openid", "s1", "n1", challenge)
            .startsWith("http://localhost:8080/authorize?response_type=code&"),
        "localhost endpoint accepted",
    )
    eq(
        "https://id.example.com/authorize?tenant=a&response_type=code&client_id=app&redirect_uri=x&scope=openid&state=s&nonce=n&code_challenge=c&code_challenge_method=S256&prompt=login&login_hint=a%40b.co",
        OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize?tenant=a", "app", "x", "openid", "s", "n", "c",
            listOf("prompt" to "login", "login_hint" to "a@b.co")),
        "existing query preserved and extra params ordered",
    )
    throwsIae("scope without openid rejected") {
        OidcPkce.buildAuthorizationUrl("https://id.example.com/authorize", "app", "x", "email", "s", "n", "c")
    }

    eq("abc", OidcPkce.parseCallback("https://app.example.com/cb?code=abc&state=s1", "s1").code, "callback code")
    eq("state_mismatch", callbackError("https://app.example.com/cb?code=abc&state=s1", "s2")?.error, "state mismatch")
    val denied = callbackError("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1")
    eq("access_denied", denied?.error, "provider error code")
    eq("User denied", denied?.errorDescription, "provider error description")
    eq("missing_code", callbackError("https://app.example.com/cb?state=s1", "s1")?.error, "missing code")

    eq(
        "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v",
        OidcPkce.tokenRequestBody("c d", "https://app.example.com/cb", "app", "v"), "token request body",
    )

    val verifier = OidcPkce.generateCodeVerifier()
    eq(64, verifier.length, "verifier default length")
    check(Regex("[A-Za-z0-9._~-]+").matches(verifier), "verifier unreserved chars")
    throwsIae("verifier length 42 rejected") { OidcPkce.generateCodeVerifier(42) }
    throwsIae("verifier length 129 rejected") { OidcPkce.generateCodeVerifier(129) }
    val token = OidcPkce.randomToken()
    check(token.length == 43 && Regex("[A-Za-z0-9_-]+").matches(token), "random token base64url without padding")

    println("OidcPkceTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
