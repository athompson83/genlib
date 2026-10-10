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

    println("GeoTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
