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

private fun near(expected: Double, actual: Double, tol: Double, name: String) = check(Math.abs(expected - actual) <= tol, "$name expected <$expected> got <$actual>")

private fun pts(vararg xy: Double) = xy.toList().chunked(2).map { it[0] to it[1] }

fun main() {
    val square = pts(0.0, 0.0, 4.0, 0.0, 4.0, 4.0, 0.0, 4.0)
    val concave = pts(0.0, 0.0, 6.0, 0.0, 6.0, 6.0, 3.0, 3.0, 0.0, 6.0)
    val pip = listOf(
        Triple(square, 2.0 to 2.0, true), Triple(square, 5.0 to 2.0, false), Triple(square, 4.0 to 2.0, true),
        Triple(square, 0.0 to 0.0, true), Triple(square, 2.0 to 4.000001, false), Triple(concave, 3.0 to 4.0, false),
        Triple(concave, 3.0 to 2.0, true), Triple(concave, 1.0 to 5.0, true), Triple(concave, 3.0 to 3.0, true),
    )
    for ((ring, p, want) in pip) eq(want, Geometry.pointInPolygon(p, ring), "pip $p")
    val closed = square + square.first()
    eq(true, Geometry.pointInPolygon(2.0 to 2.0, closed), "pip closed ring")
    eq(16.0, Geometry.signedArea(square), "area square")
    eq(-16.0, Geometry.signedArea(pts(0.0, 4.0, 4.0, 4.0, 4.0, 0.0, 0.0, 0.0)), "area clockwise")
    eq(27.0, Geometry.signedArea(concave), "area concave")
    eq(16.0, Geometry.signedArea(closed), "area closed ring")
    val c1 = Geometry.centroid(square)
    near(2.0, c1.first, 1e-9, "centroid square x")
    near(2.0, c1.second, 1e-9, "centroid square y")
    val c2 = Geometry.centroid(concave)
    near(3.0, c2.first, 1e-9, "centroid concave x")
    near(2.3333333333333335, c2.second, 1e-9, "centroid concave y")
    val line = pts(0.0, 0.0, 1.0, 0.1, 2.0, -0.1, 3.0, 5.0, 4.0, 6.0, 5.0, 7.0, 6.0, 8.1, 7.0, 9.0, 8.0, 9.0, 9.0, 9.0)
    eq(pts(0.0, 0.0, 2.0, -0.1, 3.0, 5.0, 7.0, 9.0, 9.0, 9.0), Geometry.simplify(line, 1.0), "simplify tolerance 1")
    eq(pts(0.0, 0.0, 1.0, 0.1, 2.0, -0.1, 3.0, 5.0, 6.0, 8.1, 7.0, 9.0, 9.0, 9.0), Geometry.simplify(line, 0.05), "simplify tolerance 0.05")
    eq(pts(0.0, 0.0, 5.0, 5.0), Geometry.simplify(pts(0.0, 0.0, 5.0, 5.0), 1.0), "simplify two points")
    near(12391399902.070992, Geometry.ringAreaSquareMeters(pts(0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0)), 12391399902.070992 * 1e-9, "ring area 1 degree")
    near(771337.3090775362, Geometry.ringAreaSquareMeters(pts(-0.13, 51.5, -0.12, 51.5, -0.12, 51.51, -0.13, 51.51)), 771337.3090775362 * 1e-9, "ring area london")
    throwsIae("centroid zero area") { Geometry.centroid(pts(0.0, 0.0, 1.0, 1.0, 2.0, 2.0)) }
    throwsIae("ring too short") { Geometry.signedArea(pts(0.0, 0.0, 1.0, 1.0, 0.0, 0.0)) }
    throwsIae("negative tolerance") { Geometry.simplify(line, -1.0) }
    throwsIae("NaN point") { Geometry.pointInPolygon(Double.NaN to 0.0, square) }

    println("GeometryTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
