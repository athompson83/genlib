// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun sameWithin(expected: List<Pair<Double, Double>>, actual: List<Pair<Double, Double>>, tol: Double, name: String) =
    check(expected.size == actual.size && expected.indices.all { Math.abs(expected[it].first - actual[it].first) <= tol && Math.abs(expected[it].second - actual[it].second) <= tol }, "$name got $actual")

fun main() {
    val google = listOf(38.5 to -120.2, 40.7 to -120.95, 43.252 to -126.453)
    eq("_p~iF~ps|U_ulLnnqC_mqNvxq`@", Polyline.encodePolyline(google), "encode google")
    sameWithin(google, Polyline.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), 1e-12, "decode google")
    val p6 = listOf(47.6062 to -122.3321, 47.6205 to -122.3493)
    eq("ozsxyAf{pihFw|Z~q`@", Polyline.encodePolyline(p6, 6), "encode precision 6")
    sameWithin(p6, Polyline.decodePolyline("ozsxyAf{pihFw|Z~q`@", 6), 1e-12, "decode precision 6")
    eq("", Polyline.encodePolyline(emptyList()), "encode empty")
    eq(0, Polyline.decodePolyline("").size, "decode empty")
    val odd = listOf(-0.000005 to 179.999995, 12.345678 to -45.678901, -89.99999 to 0.000004)
    sameWithin(odd, Polyline.decodePolyline(Polyline.encodePolyline(odd)), 0.5e-5, "round trip precision 5")
    sameWithin(odd, Polyline.decodePolyline(Polyline.encodePolyline(odd, 6), 6), 0.5e-6, "round trip precision 6")
    throwsIae("truncated value") { Polyline.decodePolyline("_p~iF~ps|") }
    throwsIae("missing longitude") { Polyline.decodePolyline("_p~iF") }
    throwsIae("space is outside 63..126") { Polyline.decodePolyline("_p~iF ~ps|U") }
    throwsIae("non-ASCII character") { Polyline.decodePolyline("ÿ") }
    throwsIae("NaN point") { Polyline.encodePolyline(listOf(Double.NaN to 0.0)) }
    throwsIae("negative precision") { Polyline.encodePolyline(google, -1) }

    println("PolylineTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
