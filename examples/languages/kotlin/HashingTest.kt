// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for hashing.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun utf8(s: String): ByteArray = s.toByteArray(Charsets.UTF_8)

fun main() {
    eq(0L, Hashing.crc32(utf8("")), "crc32 ''")
    eq(2166136261L, Hashing.fnv1a32(utf8("")), "fnv1a32 ''")
    eq("cbf29ce484222325", Hashing.fnv1a64(utf8("")).toString(16).padStart(16, '0'), "fnv1a64 ''")
    eq(0L, Hashing.murmur3_32(utf8("")), "murmur3 ''")
    eq(142593372L, Hashing.murmur3_32(utf8(""), 42), "murmur3 seed 42 ''")
    eq(3904355907L, Hashing.crc32(utf8("a")), "crc32 'a'")
    eq(3826002220L, Hashing.fnv1a32(utf8("a")), "fnv1a32 'a'")
    eq("af63dc4c8601ec8c", Hashing.fnv1a64(utf8("a")).toString(16).padStart(16, '0'), "fnv1a64 'a'")
    eq(1009084850L, Hashing.murmur3_32(utf8("a")), "murmur3 'a'")
    eq(3001393763L, Hashing.murmur3_32(utf8("a"), 42), "murmur3 seed 42 'a'")
    eq(2666930069L, Hashing.crc32(utf8("foobar")), "crc32 'foobar'")
    eq(3214735720L, Hashing.fnv1a32(utf8("foobar")), "fnv1a32 'foobar'")
    eq("85944171f73967e8", Hashing.fnv1a64(utf8("foobar")).toString(16).padStart(16, '0'), "fnv1a64 'foobar'")
    eq(2764362941L, Hashing.murmur3_32(utf8("foobar")), "murmur3 'foobar'")
    eq(1018276128L, Hashing.murmur3_32(utf8("foobar"), 42), "murmur3 seed 42 'foobar'")
    eq(3421780262L, Hashing.crc32(utf8("123456789")), "crc32 '123456789'")
    eq(3146166556L, Hashing.fnv1a32(utf8("123456789")), "fnv1a32 '123456789'")
    eq("06d5573923c6cdfc", Hashing.fnv1a64(utf8("123456789")).toString(16).padStart(16, '0'), "fnv1a64 '123456789'")
    eq(3036607362L, Hashing.murmur3_32(utf8("123456789")), "murmur3 '123456789'")
    eq(3059026825L, Hashing.murmur3_32(utf8("123456789"), 42), "murmur3 seed 42 '123456789'")
    eq(907060870L, Hashing.crc32(utf8("hello")), "crc32 'hello'")
    eq(1335831723L, Hashing.fnv1a32(utf8("hello")), "fnv1a32 'hello'")
    eq("a430d84680aabd0b", Hashing.fnv1a64(utf8("hello")).toString(16).padStart(16, '0'), "fnv1a64 'hello'")
    eq(613153351L, Hashing.murmur3_32(utf8("hello")), "murmur3 'hello'")
    eq(3806057185L, Hashing.murmur3_32(utf8("hello"), 42), "murmur3 seed 42 'hello'")
    eq(1095738169L, Hashing.crc32(utf8("The quick brown fox jumps over the lazy dog")), "crc32 'The quick brown fox jumps over the lazy dog'")
    eq(76545936L, Hashing.fnv1a32(utf8("The quick brown fox jumps over the lazy dog")), "fnv1a32 'The quick brown fox jumps over the lazy dog'")
    eq("f3f9b7f5e7e47110", Hashing.fnv1a64(utf8("The quick brown fox jumps over the lazy dog")).toString(16).padStart(16, '0'), "fnv1a64 'The quick brown fox jumps over the lazy dog'")
    eq(776992547L, Hashing.murmur3_32(utf8("The quick brown fox jumps over the lazy dog")), "murmur3 'The quick brown fox jumps over the lazy dog'")
    eq(880582914L, Hashing.murmur3_32(utf8("The quick brown fox jumps over the lazy dog"), 42), "murmur3 seed 42 'The quick brown fox jumps over the lazy dog'")
    eq(354246585L, Hashing.crc32(utf8("h\u00E9llo w\u00F6rld")), "crc32 'h\\u00e9llo w\\u00f6rld'")
    eq(3558752674L, Hashing.fnv1a32(utf8("h\u00E9llo w\u00F6rld")), "fnv1a32 'h\\u00e9llo w\\u00f6rld'")
    eq("11824ab841812022", Hashing.fnv1a64(utf8("h\u00E9llo w\u00F6rld")).toString(16).padStart(16, '0'), "fnv1a64 'h\\u00e9llo w\\u00f6rld'")
    eq(2549609076L, Hashing.murmur3_32(utf8("h\u00E9llo w\u00F6rld")), "murmur3 'h\\u00e9llo w\\u00f6rld'")
    eq(857211688L, Hashing.murmur3_32(utf8("h\u00E9llo w\u00F6rld"), 42), "murmur3 seed 42 'h\\u00e9llo w\\u00f6rld'")
    eq(0, Hashing.jumpHash(0uL, 1), "jump 0 1")
    eq(6, Hashing.jumpHash(1uL, 10), "jump 1 10")
    eq(520, Hashing.jumpHash(256uL, 1024), "jump 256 1024")
    eq(87, Hashing.jumpHash(3735928559uL, 100), "jump 3735928559 100")
    eq(313, Hashing.jumpHash(18446744073709551615uL, 1000), "jump 18446744073709551615 1000")
    eq(5, Hashing.jumpHash(12345678901234567uL, 7), "jump 12345678901234567 7")
    eq(1603940301, Hashing.jumpHash(42uL, 2147483647), "jump 42 2147483647")

    println("HashingTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
