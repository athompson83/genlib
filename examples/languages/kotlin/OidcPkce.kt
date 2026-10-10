// SPDX-License-Identifier: Apache-2.0
import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * OAuth 2.0 authorization code + PKCE (RFC 7636) and OpenID Connect request helpers.
 *
 * Scope: this builds and checks the browser leg only (authorization URL, callback, token request body).
 * ID token and access token VERIFICATION must use a vetted library (see the Tier B cookbook). Never decode a
 * token to make an authentication or authorization decision with this code.
 */
object OidcPkce {
    private const val UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    /** Error from the authorization callback; [error] is the OAuth error code or "state_mismatch". */
    class CallbackException(val error: String, val errorDescription: String?) :
        RuntimeException(if (errorDescription == null) error else "$error: $errorDescription")

    data class Callback(val code: String)

    fun generateCodeVerifier(length: Int = 64): String {
        require(length in 43..128) { "verifier length must be 43-128" }
        val random = SecureRandom()
        return buildString { repeat(length) { append(UNRESERVED[random.nextInt(UNRESERVED.length)]) } }
    }

    fun codeChallengeS256(verifier: String): String {
        require(verifier.isNotEmpty()) { "verifier is required" }
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }

    fun randomToken(bytes: Int = 32): String {
        require(bytes >= 16) { "token must be at least 16 bytes" }
        val data = ByteArray(bytes).also { SecureRandom().nextBytes(it) }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(data)
    }

    fun buildAuthorizationUrl(
        authorizationEndpoint: String,
        clientId: String,
        redirectUri: String,
        scope: List<String>,
        state: String,
        nonce: String,
        codeChallenge: String,
        extraParams: List<Pair<String, String>> = emptyList(),
    ): String {
        val endpoint = parse(authorizationEndpoint, "authorization endpoint")
        val scheme = endpoint.scheme?.lowercase() ?: ""
        val host = endpoint.host?.lowercase() ?: ""
        val loopback = scheme == "http" && (host == "localhost" || host == "127.0.0.1")
        require(scheme == "https" || loopback) { "authorization endpoint must use https (http only for localhost)" }
        require(host.isNotEmpty()) { "authorization endpoint must have a host" }
        require(endpoint.rawFragment == null) { "authorization endpoint must not have a fragment" }
        for ((value, name) in listOf(clientId to "clientId", redirectUri to "redirectUri", state to "state",
            nonce to "nonce", codeChallenge to "codeChallenge")) {
            require(value.isNotEmpty()) { "$name is required" }
        }
        val scopes = scope.flatMap { it.trim().split(Regex("\\s+")) }.filter { it.isNotEmpty() }
        require("openid" in scopes) { "scope must contain openid" }

        val params = listOf(
            "client_id" to clientId, "redirect_uri" to redirectUri, "scope" to scopes.joinToString(" "),
            "state" to state, "nonce" to nonce, "code_challenge" to codeChallenge, "code_challenge_method" to "S256",
        ) + extraParams
        val query = endpoint.rawQuery
        return buildString {
            append(authorizationEndpoint)
            append(if (query == null) "?" else if (query.isEmpty()) "" else "&")
            append("response_type=code")
            for ((name, value) in params) {
                require(name.isNotEmpty()) { "parameter name is required" }
                append('&').append(percentEncode(name)).append('=').append(percentEncode(value))
            }
        }
    }

    fun buildAuthorizationUrl(
        authorizationEndpoint: String, clientId: String, redirectUri: String, scope: String, state: String,
        nonce: String, codeChallenge: String, extraParams: List<Pair<String, String>> = emptyList(),
    ): String = buildAuthorizationUrl(authorizationEndpoint, clientId, redirectUri, listOf(scope), state, nonce,
        codeChallenge, extraParams)

    /** Returns the code, or throws [CallbackException] for provider errors, missing code or state mismatch. */
    fun parseCallback(callbackUrl: String, expectedState: String): Callback {
        require(expectedState.isNotEmpty()) { "expectedState is required" }
        val params = HashMap<String, String>()
        val query = parse(callbackUrl, "callback URL").rawQuery
        if (!query.isNullOrEmpty()) {
            for (pair in query.split('&')) {
                if (pair.isEmpty()) continue
                val eq = pair.indexOf('=')
                val key = decode(if (eq < 0) pair else pair.substring(0, eq))
                val value = if (eq < 0) "" else decode(pair.substring(eq + 1))
                if (params.put(key, value) != null) throw CallbackException("invalid_request", "duplicate parameter $key")
            }
        }
        params["error"]?.let { throw CallbackException(it, params["error_description"]) }
        val code = params["code"]
        if (code.isNullOrEmpty()) throw CallbackException("missing_code", "callback has no code")
        val state = params["state"]
        val stateOk = state != null && MessageDigest.isEqual(state.toByteArray(Charsets.UTF_8), expectedState.toByteArray(Charsets.UTF_8))
        if (!stateOk) throw CallbackException("state_mismatch", "callback state does not match")
        return Callback(code)
    }

    fun tokenRequestBody(code: String, redirectUri: String, clientId: String, codeVerifier: String): String {
        for ((value, name) in listOf(code to "code", redirectUri to "redirectUri", clientId to "clientId", codeVerifier to "codeVerifier")) {
            require(value.isNotEmpty()) { "$name is required" }
        }
        return "grant_type=authorization_code&code=${form(code)}&redirect_uri=${form(redirectUri)}" +
            "&client_id=${form(clientId)}&code_verifier=${form(codeVerifier)}"
    }

    private fun percentEncode(value: String): String = buildString {
        for (b in value.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xff
            if (UNRESERVED.indexOf(c.toChar()) >= 0) append(c.toChar()) else append("%%%02X".format(c))
        }
    }

    private fun form(value: String): String = URLEncoder.encode(value, "UTF-8")

    private fun decode(value: String): String = try {
        URLDecoder.decode(value, "UTF-8")
    } catch (e: IllegalArgumentException) {
        throw CallbackException("invalid_request", "malformed percent-encoding")
    }

    private fun parse(value: String, what: String): URI = try {
        URI(value)
    } catch (e: java.net.URISyntaxException) {
        throw IllegalArgumentException("invalid $what", e)
    }
}
