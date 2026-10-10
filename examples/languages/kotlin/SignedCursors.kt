// SPDX-License-Identifier: Apache-2.0
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HMAC-SHA256 signed, expiring pagination cursors: base64url(body) "." base64url(mac), unpadded. */
object SignedCursors {
    /** Why a cursor was rejected. */
    enum class Kind { MALFORMED, BAD_SIGNATURE, EXPIRED }

    /** Rejected cursor; the message starts with "malformed", "bad signature" or "expired". */
    class CursorException(val kind: Kind, message: String) : IllegalArgumentException(message)

    private fun checkSecret(secret: ByteArray) = require(secret.size >= 32) { "secret must be at least 32 bytes" }

    private fun hmac(secret: ByteArray, body: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret, "HmacSHA256")) }.doFinal(body)

    private fun b64(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    /** Signs 1 to 16 values (no newlines) that expire at [expiresAt] (unix seconds). */
    fun encodeCursor(values: List<String>, secret: ByteArray, expiresAt: Long): String {
        checkSecret(secret)
        require(values.size in 1..16) { "values must hold 1 to 16 entries" }
        require(values.none { '\n' in it }) { "values must not contain a newline" }
        require(expiresAt > 0) { "expiresAt must be positive" }
        val body = ("v1\n" + expiresAt + "\n" + values.joinToString("\n")).toByteArray(Charsets.UTF_8)
        return b64(body) + "." + b64(hmac(secret, body))
    }

    private fun malformed(why: String): Nothing = throw CursorException(Kind.MALFORMED, "malformed: $why")

    private fun decodePart(part: String, canonical: Boolean): ByteArray {
        if (part.isEmpty()) malformed("empty cursor part")
        if (!part.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' }) malformed("invalid base64url character")
        val out = try { Base64.getUrlDecoder().decode(part) } catch (e: IllegalArgumentException) { malformed("invalid base64url length") }
        if (canonical && b64(out) != part) malformed("non-canonical base64url")
        return out
    }

    /** Verifies and returns the values; throws [CursorException] (malformed, bad signature, expired). */
    fun decodeCursor(token: String, secret: ByteArray, now: Long): List<String> {
        checkSecret(secret)
        val dot = token.lastIndexOf('.')
        if (dot < 0) malformed("missing signature separator")
        val body = decodePart(token.substring(0, dot), true)
        val sig = token.substring(dot + 1)
        decodePart(sig, false)
        // Compare the encoded form so a change in the unused trailing bits of the last character is still rejected.
        val expected = b64(hmac(secret, body)).toByteArray(Charsets.US_ASCII)
        if (!MessageDigest.isEqual(expected, sig.toByteArray(Charsets.US_ASCII))) throw CursorException(Kind.BAD_SIGNATURE, "bad signature")
        val text = try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(body)).toString()
        } catch (e: CharacterCodingException) {
            malformed("body is not UTF-8")
        }
        val parts = text.split("\n")
        if (parts.size < 3 || parts[0] != "v1" || !Regex("[0-9]{1,18}").matches(parts[1])) malformed("bad header")
        if (now >= parts[1].toLong()) throw CursorException(Kind.EXPIRED, "expired")
        return parts.drop(2)
    }
}
