// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun near(expected: Double, actual: Double, tol: Double, name: String) =
    check(Math.abs(expected - actual) <= tol, "$name expected <$expected> got <$actual>")

private fun nearAll(expected: DoubleArray, actual: DoubleArray, tol: Double, name: String) {
    check(expected.size == actual.size, "$name length")
    for (i in 0 until minOf(expected.size, actual.size)) near(expected[i], actual[i], tol, "$name[$i]")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun topKCase(q: DoubleArray, vs: List<DoubleArray>, k: Int, idx: IntArray, sc: DoubleArray, name: String) {
    val got = VectorMath.topK(q, vs, k)
    eq(idx.size, got.size, "$name size")
    for (i in 0 until minOf(idx.size, got.size)) {
        eq(idx[i], got[i].index, "$name index $i")
        near(sc[i], got[i].score, 1e-9, "$name score $i")
    }
}

fun main() {
    near(32.0, VectorMath.dot(doubleArrayOf(1.0, 2.0, 3.0), doubleArrayOf(4.0, 5.0, 6.0)), 1e-9, "dot 0")
    near(0.9746318461970762, VectorMath.cosine(doubleArrayOf(1.0, 2.0, 3.0), doubleArrayOf(4.0, 5.0, 6.0)), 1e-9, "cosine 0")
    near(0.0, VectorMath.dot(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.0, 1.0)), 1e-9, "dot 1")
    near(0.0, VectorMath.cosine(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.0, 1.0)), 1e-9, "cosine 1")
    near(-2.0, VectorMath.dot(doubleArrayOf(1.0, 1.0), doubleArrayOf(-1.0, -1.0)), 1e-9, "dot 2")
    near(-0.9999999999999998, VectorMath.cosine(doubleArrayOf(1.0, 1.0), doubleArrayOf(-1.0, -1.0)), 1e-9, "cosine 2")
    near(0.0, VectorMath.dot(doubleArrayOf(0.0, 0.0), doubleArrayOf(1.0, 2.0)), 1e-9, "dot 3")
    near(0.0, VectorMath.cosine(doubleArrayOf(0.0, 0.0), doubleArrayOf(1.0, 2.0)), 1e-9, "cosine 3")
    near(25.0, VectorMath.dot(doubleArrayOf(3.0, 4.0), doubleArrayOf(3.0, 4.0)), 1e-9, "dot 4")
    near(1.0, VectorMath.cosine(doubleArrayOf(3.0, 4.0), doubleArrayOf(3.0, 4.0)), 1e-9, "cosine 4")
    near(-1.375, VectorMath.dot(doubleArrayOf(0.5, -1.5, 2.0), doubleArrayOf(2.0, 0.25, -1.0)), 1e-9, "dot 5")
    near(-0.23969749850222494, VectorMath.cosine(doubleArrayOf(0.5, -1.5, 2.0), doubleArrayOf(2.0, 0.25, -1.0)), 1e-9, "cosine 5")
    near(5.0, VectorMath.norm(doubleArrayOf(3.0, 4.0)), 1e-9, "norm 0")
    near(0.0, VectorMath.norm(doubleArrayOf(0.0, 0.0, 0.0)), 1e-9, "norm 1")
    near(2.0, VectorMath.norm(doubleArrayOf(1.0, 1.0, 1.0, 1.0)), 1e-9, "norm 2")
    near(2.5, VectorMath.norm(doubleArrayOf(-2.5)), 1e-9, "norm 3")
    nearAll(doubleArrayOf(0.6, 0.8), VectorMath.normalize(doubleArrayOf(3.0, 4.0)), 1e-9, "normalize 0")
    nearAll(doubleArrayOf(0.0, 1.0), VectorMath.normalize(doubleArrayOf(0.0, 5.0)), 1e-9, "normalize 1")
    nearAll(doubleArrayOf(0.5, 0.5, 0.5, 0.5), VectorMath.normalize(doubleArrayOf(1.0, 1.0, 1.0, 1.0)), 1e-9, "normalize 2")
    topKCase(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 0, intArrayOf(), doubleArrayOf(), "top_k 0")
    topKCase(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 1, intArrayOf(0), doubleArrayOf(1.0), "top_k 1")
    topKCase(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 3, intArrayOf(0, 1, 3), doubleArrayOf(1.0, 0.9949371890224981, 0.7071067811865476), "top_k 2")
    topKCase(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 10, intArrayOf(0, 1, 3, 2, 4), doubleArrayOf(1.0, 0.9949371890224981, 0.7071067811865476, 0.0, -1.0), "top_k 3")
    topKCase(doubleArrayOf(0.2, 0.5, 0.1), listOf(doubleArrayOf(0.1, 0.4, 0.2), doubleArrayOf(0.9, 0.1, 0.0), doubleArrayOf(0.2, 0.5, 0.1), doubleArrayOf(0.0, 0.0, 1.0), doubleArrayOf(0.3, 0.3, 0.3), doubleArrayOf(0.21, 0.49, 0.12)), 3, intArrayOf(2, 5, 0), doubleArrayOf(1.0, 0.9990003934498585, 0.956182887467515), "top_k 4")
    eq(listOf(0, 1, 4), VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 3, 0.5), "mmr 0")
    eq(listOf(0, 1, 3), VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 3, 1.0), "mmr 1")
    eq(listOf(0, 4, 2), VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 3, 0.0), "mmr 2")
    eq(listOf(0, 1, 3, 2, 4), VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 5, 0.7), "mmr 3")
    eq(listOf(2, 0, 1), VectorMath.mmr(doubleArrayOf(0.2, 0.5, 0.1), listOf(doubleArrayOf(0.1, 0.4, 0.2), doubleArrayOf(0.9, 0.1, 0.0), doubleArrayOf(0.2, 0.5, 0.1), doubleArrayOf(0.0, 0.0, 1.0), doubleArrayOf(0.3, 0.3, 0.3), doubleArrayOf(0.21, 0.49, 0.12)), 3, 0.5), "mmr 4")
    eq(listOf(2, 3, 1, 4), VectorMath.mmr(doubleArrayOf(0.2, 0.5, 0.1), listOf(doubleArrayOf(0.1, 0.4, 0.2), doubleArrayOf(0.9, 0.1, 0.0), doubleArrayOf(0.2, 0.5, 0.1), doubleArrayOf(0.0, 0.0, 1.0), doubleArrayOf(0.3, 0.3, 0.3), doubleArrayOf(0.21, 0.49, 0.12)), 4, 0.3), "mmr 5")
    eq(listOf(0, 1, 4), VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0), doubleArrayOf(0.99, 0.1), doubleArrayOf(0.0, 1.0), doubleArrayOf(0.7, 0.7), doubleArrayOf(-1.0, 0.0)), 3), "mmr default lambda")
    throwsIae("length mismatch: cosine([1,2],[1,2,3])") { VectorMath.cosine(doubleArrayOf(1.0, 2.0), doubleArrayOf(1.0, 2.0, 3.0)) }
    throwsIae("empty: dot([],[])") { VectorMath.dot(doubleArrayOf(), doubleArrayOf()) }
    throwsIae("normalize([0,0])") { VectorMath.normalize(doubleArrayOf(0.0, 0.0)) }
    throwsIae("top_k k=-1") { VectorMath.topK(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0)), -1) }
    throwsIae("mmr lambda=1.5") { VectorMath.mmr(doubleArrayOf(1.0, 0.0), listOf(doubleArrayOf(1.0, 0.0)), 1, 1.5) }

    println("VectorMathTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
