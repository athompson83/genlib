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

fun main() {
    val seq = ByteArray(10) { (it + 1).toByte() }
    val ms = 1790000000123L
    val max = (1L shl 48) - 1
    eq("01a0c450-6c7b-7102-8304-05060708090a", Ids.uuidV7(ms, seq), "uuid7 vector")
    eq("01M3250V3V041061050R3GG28A", Ids.ulid(ms, seq), "ulid vector")
    eq("00000000-0000-7000-8000-000000000000", Ids.uuidV7(0, ByteArray(10)), "uuid7 zero vector")
    eq("7ZZZZZZZZZZZZZZZZZZZZZZZZZ", Ids.ulid(max, ByteArray(10) { 0xff.toByte() }), "ulid max time vector")

    eq(ms, Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090a"), "uuid7 time round trip")
    eq(ms, Ids.uuidV7Time("01A0C450-6C7B-7102-8304-05060708090A"), "uuid7 time upper case")
    eq(0L, Ids.uuidV7Time("00000000-0000-7000-8000-000000000000"), "uuid7 zero time")
    eq(ms, Ids.ulidTime("01M3250V3V041061050R3GG28A"), "ulid time round trip")
    eq(ms, Ids.ulidTime("01m3250v3v041061050r3gg28a"), "ulid time lower case")
    eq(max, Ids.ulidTime("7ZZZZZZZZZZZZZZZZZZZZZZZZZ"), "ulid max time")

    throwsIae("uuid7 negative time") { Ids.uuidV7(-1, seq) }
    throwsIae("uuid7 time above 2^48-1") { Ids.uuidV7(max + 1, seq) }
    throwsIae("ulid 9 random bytes") { Ids.ulid(0, ByteArray(9)) }
    throwsIae("uuid version 4 rejected") { Ids.uuidV7Time("01a0c450-6c7b-4102-8304-05060708090a") }
    throwsIae("uuid bad variant rejected") { Ids.uuidV7Time("01a0c450-6c7b-7102-c304-05060708090a") }
    throwsIae("uuid misplaced dash") { Ids.uuidV7Time("01a0c4506c7b-7102-8304-05060708090a0") }
    throwsIae("uuid short") { Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090") }
    throwsIae("uuid non-hex") { Ids.uuidV7Time("01a0c450-6c7b-7102-8304-05060708090g") }
    throwsIae("ulid first char above 7") { Ids.ulidTime("81M3250V3V041061050R3GG28A") }
    throwsIae("ulid invalid char U") { Ids.ulidTime("01M3250V3V041061050R3GG28U") }
    throwsIae("ulid short") { Ids.ulidTime("01M3250V3V041061050R3GG28") }

    val u1 = Ids.newUuidV7()
    val u2 = Ids.newUuidV7()
    check(Regex("[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}").matches(u1), "newUuidV7 format $u1")
    check(u1 != u2, "newUuidV7 differs")
    val l1 = Ids.newUlid()
    val l2 = Ids.newUlid()
    check(Regex("[0-7][0-9A-HJKMNP-TV-Z]{25}").matches(l1), "newUlid format $l1")
    check(l1 != l2, "newUlid differs")
    check(Math.abs(Ids.ulidTime(l1) - System.currentTimeMillis()) < 60000, "newUlid uses the clock")

    println("IdsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
