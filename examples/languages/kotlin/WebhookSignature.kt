// SPDX-License-Identifier: Apache-2.0
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** Stripe-style webhook signatures: header "t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "t.body")>". */
object WebhookSignature {
    /** Why a webhook was rejected. */
    enum class Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected webhook; the message starts with "malformed", "bad signature" or "expired". */
    class WebhookException(val kind: Kind, message: String) : IllegalArgumentException(message)

    const val DEFAULT_TOLERANCE_SECONDS = 300L
    private const val HEX = "0123456789abcdef"
    private val TIMESTAMP = Regex("[0-9]{1,18}")
    private val V1 = Regex("[0-9a-f]{64}")

    private fun hmacHex(secret: String, timestamp: Long, body: String): String {
        require(secret.isNotEmpty()) { "secret must not be empty" }
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256")) }
            .doFinal("$timestamp.$body".toByteArray(Charsets.UTF_8))
        val out = StringBuilder(64)
        for (b in mac) out.append(HEX[(b.toInt() shr 4) and 0x0f]).append(HEX[b.toInt() and 0x0f])
        return out.toString()
    }

    /** Signature header for [body] at [timestampSeconds]. */
    fun signWebhook(secret: String, timestampSeconds: Long, body: String): String {
        require(timestampSeconds >= 0) { "timestampSeconds must be >= 0" }
        return "t=$timestampSeconds,v1=" + hmacHex(secret, timestampSeconds, body)
    }

    private fun malformed(why: String): Nothing = throw WebhookException(Kind.MALFORMED, "malformed: $why")

    /** Throws [WebhookException] (malformed, bad signature, expired) unless some v1 matches and t is within tolerance. */
    fun verifyWebhook(header: String, body: String, secret: String, nowSeconds: Long, toleranceSeconds: Long = DEFAULT_TOLERANCE_SECONDS) {
        require(secret.isNotEmpty()) { "secret must not be empty" }
        require(toleranceSeconds >= 0) { "toleranceSeconds must be >= 0" }
        var t: Long? = null
        val sigs = mutableListOf<String>()
        for (part in header.split(",")) {
            val eq = part.indexOf('=')
            if (eq < 0) malformed("expected key=value pairs")
            val key = part.substring(0, eq).trim()
            val value = part.substring(eq + 1).trim()
            when (key) {
                "t" -> {
                    if (t != null) malformed("more than one timestamp")
                    if (!TIMESTAMP.matches(value)) malformed("timestamp must be decimal seconds")
                    t = value.toLong()
                }
                "v1" -> {
                    if (!V1.matches(value)) malformed("v1 must be 64 lowercase hex characters")
                    sigs += value
                }
            }
        }
        val ts = t ?: malformed("missing timestamp")
        if (sigs.isEmpty()) malformed("missing v1 signature")
        val expected = hmacHex(secret, ts, body).toByteArray(Charsets.US_ASCII)
        var match = false
        for (s in sigs) match = match or MessageDigest.isEqual(expected, s.toByteArray(Charsets.US_ASCII))
        if (!match) throw WebhookException(Kind.BAD_SIGNATURE, "bad signature")
        val diff = try { Math.abs(Math.subtractExact(nowSeconds, ts)) } catch (e: ArithmeticException) { Long.MAX_VALUE }
        if (diff < 0 || diff > toleranceSeconds) throw WebhookException(Kind.EXPIRED, "expired")
    }
}
