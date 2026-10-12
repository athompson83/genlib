// SPDX-License-Identifier: Apache-2.0
import kotlin.math.abs
import kotlin.math.roundToLong
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

private fun roundTrip(hash: String, lat: Double, lon: Double) {
    val c = Geo.geohashDecode(hash)
    check(abs(c.lat - lat) <= c.latError && abs(c.lon - lon) <= c.lonError, "decode $hash contains input")
}

fun main() {
    eq(343557L, Geo.haversineMeters(51.5074, -0.1278, 48.8566, 2.3522).roundToLong(), "london_paris_m")
    eq(0L, Geo.haversineMeters(10.0, 10.0, 10.0, 10.0).roundToLong(), "same_m")
    eq(20015114L, Geo.haversineMeters(0.0, 0.0, 0.0, 180.0).roundToLong(), "antipode_m")
    throwsIae("latitude above 90") { Geo.haversineMeters(91.0, 0.0, 0.0, 0.0) }
    throwsIae("longitude below -180") { Geo.haversineMeters(0.0, 0.0, 0.0, -180.5) }
    throwsIae("NaN latitude") { Geo.haversineMeters(Double.NaN, 0.0, 0.0, 0.0) }

    eq("9q8yyk8yt", Geo.geohashEncode(37.7749, -122.4194, 9), "gh_sf_9")
    eq("s0000", Geo.geohashEncode(0.0, 0.0, 5), "gh_zero_5")
    eq("r3gx2f7", Geo.geohashEncode(-33.8688, 151.2093, 7), "gh_sydney_7")
    roundTrip("9q8yyk8yt", 37.7749, -122.4194)
    roundTrip("s0000", 0.0, 0.0)
    roundTrip("r3gx2f7", -33.8688, 151.2093)
    roundTrip("9Q8YYK8YT", 37.7749, -122.4194)
    throwsIae("precision 0") { Geo.geohashEncode(0.0, 0.0, 0) }
    throwsIae("precision 13") { Geo.geohashEncode(0.0, 0.0, 13) }
    throwsIae("decode rejects a") { Geo.geohashDecode("s0a0") }
    throwsIae("decode rejects empty") { Geo.geohashDecode("") }

    val b = Geo.boundingBox(51.5, -0.12, 10000.0)
    val r = 10000.0 - 1
    check(Geo.haversineMeters(51.5, -0.12, b.maxLat, -0.12) >= r, "box north side")
    check(Geo.haversineMeters(51.5, -0.12, b.minLat, -0.12) >= r, "box south side")
    check(Geo.haversineMeters(51.5, -0.12, 51.5, b.maxLon) >= r, "box east side")
    check(Geo.haversineMeters(51.5, -0.12, 51.5, b.minLon) >= r, "box west side")
    check(b.maxLon - b.minLon > b.maxLat - b.minLat, "longitude span widened at 51.5N")
    val polar = Geo.boundingBox(89.99, 0.0, 10000.0)
    check(polar.maxLat == 90.0 && polar.minLon == -180.0 && polar.maxLon == 180.0, "polar box clamps and spans all longitudes")
    throwsIae("negative radius") { Geo.boundingBox(0.0, 0.0, -1.0) }

    // Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
    val wide = Geo.boundingBox(60.0, 0.0, 0.1 * Geo.EARTH_RADIUS_M)
    val half = Math.toRadians(wide.maxLon)
    val want = Math.asin(Math.sin(0.1) / Math.cos(Math.toRadians(60.0)))
    check(abs(half - want) <= 1e-6 * want && abs(half - 0.20101) < 1e-5, "lat 60 r 0.1 half-width $half want $want")
    check(abs(wide.minLon + wide.maxLon) < 1e-12, "lat 60 box symmetric")
    var allInside = true
    for (cLat in doubleArrayOf(0.0, 45.0, 60.0, 75.0, -70.0)) {
        for (radius in doubleArrayOf(1_000.0, 100_000.0, 1_000_000.0)) {
            val box = Geo.boundingBox(cLat, 0.0, radius)
            val d = radius / Geo.EARTH_RADIUS_M
            val p1 = Math.toRadians(cLat)
            for (i in 0 until 360) {
                val t = Math.toRadians(i.toDouble())
                val p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t))
                val l2 = Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
                val pLat = Math.toDegrees(p2)
                val pLon = Math.toDegrees(l2)
                if (pLat < box.minLat - 1e-9 || pLat > box.maxLat + 1e-9 || pLon < box.minLon - 1e-9 || pLon > box.maxLon + 1e-9) {
                    if (allInside) System.err.println("outside: center $cLat, radius $radius, bearing $i: $pLat,$pLon $box")
                    allInside = false
                }
            }
        }
    }
    check(allInside, "circle points at 360 bearings lie inside the box")
    for ((cLon, bearing) in listOf(179.9 to 90.0, -179.9 to 270.0)) {
        val box = Geo.boundingBox(10.0, cLon, 50_000.0)
        check(box.minLon == -180.0 && box.maxLon == 180.0, "antimeridian center lon $cLon spans all longitudes $box")
        val d = 50_000.0 / Geo.EARTH_RADIUS_M
        val p1 = Math.toRadians(10.0)
        val t = Math.toRadians(bearing)
        val p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t))
        val l2 = Math.toRadians(cLon) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
        val pLat = Math.toDegrees(p2)
        val pLon = ((Math.toDegrees(l2) + 540) % 360) - 180
        check(abs(pLon) > 179.5 && pLat >= box.minLat && pLat <= box.maxLat && pLon >= box.minLon && pLon <= box.maxLon,
            "antimeridian far-side point $pLat,$pLon inside $box")
    }

    println("GeoTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
