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

private fun near(expected: List<Double>, actual: List<Double>, tol: Double, name: String) =
    check(expected.size == actual.size && expected.indices.all { Math.abs(expected[it] - actual[it]) <= tol }, "$name expected $expected got $actual")

private fun TileMath.Bounds.list() = listOf(west, south, east, north)

fun main() {
    val tiles = listOf(listOf(-122.4194, 37.7749, 12.0, 655.0, 1583.0), listOf(0.0, 0.0, 0.0, 0.0, 0.0), listOf(2.3522, 48.8566, 15.0, 16598.0, 11273.0), listOf(179.9999, -89.9, 3.0, 7.0, 7.0), listOf(-180.0, 85.1, 2.0, 0.0, 0.0))
    for (t in tiles) eq(TileMath.Tile(t[3].toLong(), t[4].toLong(), t[2].toInt()), TileMath.lonLatToTile(t[0], t[1], t[2].toInt()), "tile $t")
    near(listOf(-180.0, -85.0511287798066, 180.0, 85.0511287798066), TileMath.tileBounds(0, 0, 0).list(), 1e-9, "bounds 0/0/0")
    near(listOf(-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046), TileMath.tileBounds(655, 1583, 12).list(), 1e-9, "bounds 12/655/1583")
    near(listOf(0.0, -85.0511287798066, 180.0, 0.0), TileMath.tileBounds(1, 1, 1).list(), 1e-9, "bounds 1/1/1")
    for ((tile, key) in listOf(TileMath.Tile(3, 5, 3) to "213", TileMath.Tile(655, 1583, 12) to "023010203333", TileMath.Tile(0, 0, 1) to "0")) {
        eq(key, TileMath.tileToQuadkey(tile.x, tile.y, tile.zoom), "quadkey $key")
        eq(tile, TileMath.quadkeyToTile(key), "quadkey to tile $key")
    }
    eq(TileMath.Tile(0, 0, 0), TileMath.quadkeyToTile(""), "empty quadkey is zoom 0")
    eq("", TileMath.tileToQuadkey(0, 0, 0), "zoom 0 quadkey")
    near(listOf(0.0, -7.081154551613622e-10), TileMath.lonLatToMercator(0.0, 0.0).toList(), 1e-6, "mercator 0,0")
    near(listOf(-13627665.271218073, 4547675.354340557), TileMath.lonLatToMercator(-122.4194, 37.7749).toList(), 1e-6, "mercator sf")
    near(listOf(20037508.342789244, 20037508.342789244), TileMath.lonLatToMercator(180.0, 85.05112877980659).toList(), 1e-6, "mercator corner")
    throwsIae("zoom 25") { TileMath.lonLatToTile(0.0, 0.0, 25) }
    throwsIae("zoom -1") { TileMath.lonLatToTile(0.0, 0.0, -1) }
    throwsIae("NaN lon") { TileMath.lonLatToTile(Double.NaN, 0.0, 3) }
    throwsIae("lon out of range") { TileMath.lonLatToTile(180.1, 0.0, 3) }
    throwsIae("x out of range") { TileMath.tileBounds(2, 0, 1) }
    throwsIae("y negative") { TileMath.tileBounds(0, -1, 1) }
    throwsIae("quadkey digit 4") { TileMath.quadkeyToTile("0124") }
    throwsIae("mercator lat too large") { TileMath.lonLatToMercator(0.0, 85.1) }

    println("TileMathTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
