// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

/** Equality plus identical toString, so map entry order is checked too. */
private fun eqOrd(expected: Any?, actual: Any?, name: String) {
    eq(expected, actual, name)
    eq(expected.toString(), actual.toString(), "$name (order)")
}

/** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
private fun near(expected: Double, actual: Double, name: String) =
    check(Math.abs(expected - actual) <= maxOf(1e-9 * maxOf(Math.abs(expected), Math.abs(actual)), 1e-12), "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun omap(vararg kv: Pair<String, Any?>): LinkedHashMap<String, Any?> = linkedMapOf(*kv)

private fun lst(vararg xs: Any?): ArrayList<Any?> = arrayListOf(*xs)

fun main() {
    eq("f74a62a458befdbf", "%016x".format(BloomFilter.fnv1a64("apple".toByteArray()).toLong()), "fnv 0")
    eq("b4d3b6b1c372c890", "%016x".format(BloomFilter.fnv1a64("banana".toByteArray()).toLong()), "fnv 1")
    eq("cbf29ce484222325", "%016x".format(BloomFilter.fnv1a64("".toByteArray()).toLong()), "fnv 2")
    eq("48e8823acfa40d89", "%016x".format(BloomFilter.fnv1a64("caf\u00e9".toByteArray()).toLong()), "fnv 3")
    eq("feff073875020288", "%016x".format(BloomFilter.fnv1a64("\ud83d\ude00".toByteArray()).toLong()), "fnv 4")
    eq("6c151ea4dcd221c2", "%016x".format(BloomFilter.fnv1a64("user:42".toByteArray()).toLong()), "fnv 5")
    eq("060324515a7b4e27", "%016x".format(BloomFilter.fnv1a64("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".toByteArray()).toLong()), "fnv 6")
    eq(Pair(8, 6), BloomFilter.bloomSizeFor(1, 0.5), "size 0")
    eq(Pair(96, 7), BloomFilter.bloomSizeFor(10, 0.01), "size 1")
    eq(Pair(959, 7), BloomFilter.bloomSizeFor(100, 0.01), "size 2")
    eq(Pair(14378, 10), BloomFilter.bloomSizeFor(1000, 0.001), "size 3")
    eq(Pair(31177, 4), BloomFilter.bloomSizeFor(5000, 0.05), "size 4")
    eq(Pair(8, 2), BloomFilter.bloomSizeFor(3, 0.3), "size 5")
    throwsIae("invalid size 0") { BloomFilter.bloomSizeFor(0, 0.1) }
    throwsIae("invalid size 1") { BloomFilter.bloomSizeFor(10, 0.0) }
    throwsIae("invalid size 2") { BloomFilter.bloomSizeFor(10, 1.0) }
    throwsIae("invalid size 3") { BloomFilter.bloomSizeFor(10, 1.5) }
    val b = BloomFilter(256, 5)
    eq(listOf(191, 99, 7, 171, 79), b.positions("apple"), "positions 0")
    eq(listOf(144, 65, 242, 163, 84), b.positions("banana"), "positions 1")
    eq(listOf(37, 9, 237, 209, 181), b.positions(""), "positions 2")
    eq(listOf(137, 195, 253, 55, 113), b.positions("caf\u00e9"), "positions 3")
    eq(listOf(136, 192, 248, 48, 104), b.positions("\ud83d\ude00"), "positions 4")
    eq(listOf(194, 102, 10, 174, 82), b.positions("user:42"), "positions 5")
    eq(listOf(39, 120, 201, 26, 107), b.positions("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), "positions 6")
    b.add("apple")
    b.add("banana")
    b.add("")
    b.add("caf\u00e9")
    b.add("\ud83d\ude00")
    eq("gAIAACAAgQACgBAACAECAAADAQAICCCACQACAAAgBCE", b.serialize(), "serialized")
    eq(true, b.mightContain("apple"), "probe 0")
    eq(true, b.mightContain("banana"), "probe 1")
    eq(true, b.mightContain(""), "probe 2")
    eq(true, b.mightContain("caf\u00e9"), "probe 3")
    eq(true, b.mightContain("\ud83d\ude00"), "probe 4")
    eq(false, b.mightContain("cherry"), "probe 5")
    eq(false, b.mightContain("user:42"), "probe 6")
    eq(false, b.mightContain("zzz"), "probe 7")
    eq(false, b.mightContain("Apple"), "probe 8")
    eq(5L, b.countEstimate(), "count estimate")
    val c = BloomFilter(256, 5)
    c.add("cherry")
    val u = b.union(c)
    eq("gAIAACAAgQACgBAACAESAAADIQAICGCACQCCAAAgBCE", u.serialize(), "union")
    eq(6L, u.countEstimate(), "union count")
    eq(true, u.mightContain("cherry"), "union has cherry")
    eq(b.serialize(), BloomFilter.deserialize(256, 5, b.serialize()).serialize(), "deserialize round trip")
    eq(true, BloomFilter.deserialize(256, 5, b.serialize()).mightContain("apple"), "deserialized probe")
    throwsIae("deserialize wrong length") { BloomFilter.deserialize(256, 5, "AAAA") }
    throwsIae("union mismatch") { b.union(BloomFilter(256, 6)) }
    throwsIae("m too small") { BloomFilter(7, 1) }
    val full = BloomFilter(8, 1)
    for (i in 0 until 200) full.add("x$i")
    eq(null, full.countEstimate(), "saturated")

    println("BloomFilterTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
