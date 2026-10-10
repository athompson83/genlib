// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for base-encodings.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun hex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

private fun toHex(b: ByteArray): String = b.joinToString("") { "%02x".format(it.toInt() and 0xff) }

fun main() {
    eq("", BaseEncodings.base32Encode(hex("")), "base32 ")
    eq("", BaseEncodings.base32Encode(hex(""), "hex", true), "base32hex ")
    eq("", BaseEncodings.base32Encode(hex(""), "rfc4648", false), "base32 unpadded ")
    eq("", toHex(BaseEncodings.base32Decode("")), "base32 decode ")
    eq("", toHex(BaseEncodings.base32Decode("", "hex", true)), "base32hex decode ")
    eq("", toHex(BaseEncodings.base32Decode("", "rfc4648", false)), "base32 unpadded decode ")
    eq("MY======", BaseEncodings.base32Encode(hex("66")), "base32 66")
    eq("CO======", BaseEncodings.base32Encode(hex("66"), "hex", true), "base32hex 66")
    eq("MY", BaseEncodings.base32Encode(hex("66"), "rfc4648", false), "base32 unpadded 66")
    eq("66", toHex(BaseEncodings.base32Decode("MY======")), "base32 decode MY======")
    eq("66", toHex(BaseEncodings.base32Decode("CO======", "hex", true)), "base32hex decode CO======")
    eq("66", toHex(BaseEncodings.base32Decode("MY", "rfc4648", false)), "base32 unpadded decode MY")
    eq("MZXQ====", BaseEncodings.base32Encode(hex("666f")), "base32 666f")
    eq("CPNG====", BaseEncodings.base32Encode(hex("666f"), "hex", true), "base32hex 666f")
    eq("MZXQ", BaseEncodings.base32Encode(hex("666f"), "rfc4648", false), "base32 unpadded 666f")
    eq("666f", toHex(BaseEncodings.base32Decode("MZXQ====")), "base32 decode MZXQ====")
    eq("666f", toHex(BaseEncodings.base32Decode("CPNG====", "hex", true)), "base32hex decode CPNG====")
    eq("666f", toHex(BaseEncodings.base32Decode("MZXQ", "rfc4648", false)), "base32 unpadded decode MZXQ")
    eq("MZXW6===", BaseEncodings.base32Encode(hex("666f6f")), "base32 666f6f")
    eq("CPNMU===", BaseEncodings.base32Encode(hex("666f6f"), "hex", true), "base32hex 666f6f")
    eq("MZXW6", BaseEncodings.base32Encode(hex("666f6f"), "rfc4648", false), "base32 unpadded 666f6f")
    eq("666f6f", toHex(BaseEncodings.base32Decode("MZXW6===")), "base32 decode MZXW6===")
    eq("666f6f", toHex(BaseEncodings.base32Decode("CPNMU===", "hex", true)), "base32hex decode CPNMU===")
    eq("666f6f", toHex(BaseEncodings.base32Decode("MZXW6", "rfc4648", false)), "base32 unpadded decode MZXW6")
    eq("MZXW6YQ=", BaseEncodings.base32Encode(hex("666f6f62")), "base32 666f6f62")
    eq("CPNMUOG=", BaseEncodings.base32Encode(hex("666f6f62"), "hex", true), "base32hex 666f6f62")
    eq("MZXW6YQ", BaseEncodings.base32Encode(hex("666f6f62"), "rfc4648", false), "base32 unpadded 666f6f62")
    eq("666f6f62", toHex(BaseEncodings.base32Decode("MZXW6YQ=")), "base32 decode MZXW6YQ=")
    eq("666f6f62", toHex(BaseEncodings.base32Decode("CPNMUOG=", "hex", true)), "base32hex decode CPNMUOG=")
    eq("666f6f62", toHex(BaseEncodings.base32Decode("MZXW6YQ", "rfc4648", false)), "base32 unpadded decode MZXW6YQ")
    eq("MZXW6YTB", BaseEncodings.base32Encode(hex("666f6f6261")), "base32 666f6f6261")
    eq("CPNMUOJ1", BaseEncodings.base32Encode(hex("666f6f6261"), "hex", true), "base32hex 666f6f6261")
    eq("MZXW6YTB", BaseEncodings.base32Encode(hex("666f6f6261"), "rfc4648", false), "base32 unpadded 666f6f6261")
    eq("666f6f6261", toHex(BaseEncodings.base32Decode("MZXW6YTB")), "base32 decode MZXW6YTB")
    eq("666f6f6261", toHex(BaseEncodings.base32Decode("CPNMUOJ1", "hex", true)), "base32hex decode CPNMUOJ1")
    eq("666f6f6261", toHex(BaseEncodings.base32Decode("MZXW6YTB", "rfc4648", false)), "base32 unpadded decode MZXW6YTB")
    eq("MZXW6YTBOI======", BaseEncodings.base32Encode(hex("666f6f626172")), "base32 666f6f626172")
    eq("CPNMUOJ1E8======", BaseEncodings.base32Encode(hex("666f6f626172"), "hex", true), "base32hex 666f6f626172")
    eq("MZXW6YTBOI", BaseEncodings.base32Encode(hex("666f6f626172"), "rfc4648", false), "base32 unpadded 666f6f626172")
    eq("666f6f626172", toHex(BaseEncodings.base32Decode("MZXW6YTBOI======")), "base32 decode MZXW6YTBOI======")
    eq("666f6f626172", toHex(BaseEncodings.base32Decode("CPNMUOJ1E8======", "hex", true)), "base32hex decode CPNMUOJ1E8======")
    eq("666f6f626172", toHex(BaseEncodings.base32Decode("MZXW6YTBOI", "rfc4648", false)), "base32 unpadded decode MZXW6YTBOI")
    eq("666f6f626172", toHex(BaseEncodings.base32Decode("mzxw6ytboi======")), "base32 case-insensitive mzxw6ytboi======")
    throwsIae("base32 invalid MZXW6YT") { BaseEncodings.base32Decode("MZXW6YT", "rfc4648", true) }
    throwsIae("base32 invalid MZXW6YR=") { BaseEncodings.base32Decode("MZXW6YR=", "rfc4648", true) }
    throwsIae("base32 invalid MZ======") { BaseEncodings.base32Decode("MZ======", "rfc4648", true) }
    throwsIae("base32 invalid MZXW6YTB1=======") { BaseEncodings.base32Decode("MZXW6YTB1=======", "rfc4648", true) }
    throwsIae("base32 invalid MZXR====") { BaseEncodings.base32Decode("MZXR====", "rfc4648", true) }
    throwsIae("base32 invalid MZXW6===") { BaseEncodings.base32Decode("MZXW6===", "rfc4648", false) }
    eq("", BaseEncodings.base58Encode(hex("")), "base58 ")
    eq("", toHex(BaseEncodings.base58Decode("")), "base58 decode ")
    eq("2NEpo7TZRRrLZSi2U", BaseEncodings.base58Encode(hex("48656c6c6f20576f726c6421")), "base58 48656c6c6f20576f726c6421")
    eq("48656c6c6f20576f726c6421", toHex(BaseEncodings.base58Decode("2NEpo7TZRRrLZSi2U")), "base58 decode 2NEpo7TZRRrLZSi2U")
    eq("11233QC4", BaseEncodings.base58Encode(hex("0000287fb4cd")), "base58 0000287fb4cd")
    eq("0000287fb4cd", toHex(BaseEncodings.base58Decode("11233QC4")), "base58 decode 11233QC4")
    eq("1", BaseEncodings.base58Encode(hex("00")), "base58 00")
    eq("00", toHex(BaseEncodings.base58Decode("1")), "base58 decode 1")
    eq("11", BaseEncodings.base58Encode(hex("0000")), "base58 0000")
    eq("0000", toHex(BaseEncodings.base58Decode("11")), "base58 decode 11")
    eq("5Q", BaseEncodings.base58Encode(hex("ff")), "base58 ff")
    eq("ff", toHex(BaseEncodings.base58Decode("5Q")), "base58 decode 5Q")
    eq("1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L", BaseEncodings.base58Encode(hex("00eb15231dfceb60925886b67d065299925915aeb172c06647")), "base58 00eb15231dfceb60925886b67d065299925915aeb172c06647")
    eq("00eb15231dfceb60925886b67d065299925915aeb172c06647", toHex(BaseEncodings.base58Decode("1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L")), "base58 decode 1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L")
    throwsIae("base58 invalid 0OIl") { BaseEncodings.base58Decode("0OIl") }
    throwsIae("base58 invalid abc0") { BaseEncodings.base58Decode("abc0") }
    throwsIae("base58 invalid I") { BaseEncodings.base58Decode("I") }
    eq("", BaseEncodings.base64UrlEncode(hex("")), "base64url ")
    eq("", toHex(BaseEncodings.base64UrlDecode("")), "base64url decode ")
    eq("Zg", BaseEncodings.base64UrlEncode(hex("66")), "base64url 66")
    eq("66", toHex(BaseEncodings.base64UrlDecode("Zg")), "base64url decode Zg")
    eq("Zm8", BaseEncodings.base64UrlEncode(hex("666f")), "base64url 666f")
    eq("666f", toHex(BaseEncodings.base64UrlDecode("Zm8")), "base64url decode Zm8")
    eq("Zm9v", BaseEncodings.base64UrlEncode(hex("666f6f")), "base64url 666f6f")
    eq("666f6f", toHex(BaseEncodings.base64UrlDecode("Zm9v")), "base64url decode Zm9v")
    eq("Zm9vYg", BaseEncodings.base64UrlEncode(hex("666f6f62")), "base64url 666f6f62")
    eq("666f6f62", toHex(BaseEncodings.base64UrlDecode("Zm9vYg")), "base64url decode Zm9vYg")
    eq("Zm9vYmE", BaseEncodings.base64UrlEncode(hex("666f6f6261")), "base64url 666f6f6261")
    eq("666f6f6261", toHex(BaseEncodings.base64UrlDecode("Zm9vYmE")), "base64url decode Zm9vYmE")
    eq("Zm9vYmFy", BaseEncodings.base64UrlEncode(hex("666f6f626172")), "base64url 666f6f626172")
    eq("666f6f626172", toHex(BaseEncodings.base64UrlDecode("Zm9vYmFy")), "base64url decode Zm9vYmFy")
    eq("-_8", BaseEncodings.base64UrlEncode(hex("fbff")), "base64url fbff")
    eq("fbff", toHex(BaseEncodings.base64UrlDecode("-_8")), "base64url decode -_8")
    eq("AAECAwQF", BaseEncodings.base64UrlEncode(hex("000102030405")), "base64url 000102030405")
    eq("000102030405", toHex(BaseEncodings.base64UrlDecode("AAECAwQF")), "base64url decode AAECAwQF")
    throwsIae("base64url invalid Zg==") { BaseEncodings.base64UrlDecode("Zg==") }
    throwsIae("base64url invalid Zh") { BaseEncodings.base64UrlDecode("Zh") }
    throwsIae("base64url invalid a") { BaseEncodings.base64UrlDecode("a") }
    throwsIae("base64url invalid +/") { BaseEncodings.base64UrlDecode("+/") }
    throwsIae("base64url invalid Zm9v!") { BaseEncodings.base64UrlDecode("Zm9v!") }

    println("BaseEncodingsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
