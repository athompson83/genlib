// SPDX-License-Identifier: Apache-2.0
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Expiring signed URLs: "target?...&expires=<unix seconds>&signature=<base64url HMAC-SHA256 without padding>". */
object SignedUrls {
    /** Why a signed URL was rejected. */
    enum class Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected URL; the message starts with "malformed", "bad signature" or "expired". */
    class SignedUrlException(val kind: Kind, message: String) : IllegalArgumentException(message)

    private const val SIG = "&signature="
    private val SIGNATURE = Regex("[A-Za-z0-9_-]{43}")
    private val DECIMAL = Regex("[0-9]{1,18}")

    private fun mac(secret: String, message: String): String {
        require(secret.isNotEmpty()) { "secret must not be empty" }
        val m = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256")) }
        return Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal(message.toByteArray(Charsets.UTF_8)))
    }

    private fun paramName(pair: String) = pair.substringBefore('=')

    /** Signs a path (plus optional query) starting with "/" so it is valid until [expiresUnixSeconds] inclusive. */
    fun signUrl(target: String, secret: String, expiresUnixSeconds: Long): String {
        require(target.startsWith("/")) { "target must start with \"/\"" }
        require('#' !in target) { "target must not contain a fragment" }
        require(expiresUnixSeconds >= 0) { "expiresUnixSeconds must be >= 0" }
        require(secret.isNotEmpty()) { "secret must not be empty" }
        val q = target.indexOf('?')
        if (q >= 0) {
            for (pair in target.substring(q + 1).split("&")) {
                val name = paramName(pair)
                require(name != "expires" && name != "signature") { "target already has a \"$name\" parameter" }
            }
        }
        val message = target + (if (q >= 0) "&" else "?") + "expires=" + expiresUnixSeconds
        return message + SIG + mac(secret, message)
    }

    private fun malformed(why: String): Nothing = throw SignedUrlException(Kind.MALFORMED, "malformed: $why")

    /** Throws [SignedUrlException] (malformed, bad signature, expired) unless the URL is authentic and now <= expires. */
    fun verifyUrl(signed: String, secret: String, nowUnixSeconds: Long) {
        require(secret.isNotEmpty()) { "secret must not be empty" }
        val at = signed.lastIndexOf(SIG)
        if (at < 0) malformed("missing signature")
        val sig = signed.substring(at + SIG.length)
        if (!SIGNATURE.matches(sig)) malformed("signature must be 43 base64url characters at the end")
        val message = signed.substring(0, at)
        val q = message.indexOf('?')
        if (q < 0) malformed("missing expires")
        val values = message.substring(q + 1).split("&").filter { paramName(it) == "expires" }.map { it.substringAfter('=', "") }
        if (values.size != 1) malformed("expected exactly one expires parameter")
        val expires = values[0]
        if (!DECIMAL.matches(expires)) malformed("expires must be decimal seconds")
        val expected = mac(secret, message).toByteArray(Charsets.US_ASCII)
        if (!MessageDigest.isEqual(expected, sig.toByteArray(Charsets.US_ASCII))) throw SignedUrlException(Kind.BAD_SIGNATURE, "bad signature")
        if (nowUnixSeconds > expires.toLong()) throw SignedUrlException(Kind.EXPIRED, "expired")
    }
}
