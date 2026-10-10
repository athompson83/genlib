// SPDX-License-Identifier: Apache-2.0

public final class GeoTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void roundTrip(String hash, double lat, double lon) {
        Geo.Cell c = Geo.geohashDecode(hash);
        check(Math.abs(c.lat() - lat) <= c.latError() && Math.abs(c.lon() - lon) <= c.lonError(), "decode " + hash + " contains input");
    }

    public static void main(String[] args) {
        eq(343557L, Math.round(Geo.haversineMeters(51.5074, -0.1278, 48.8566, 2.3522)), "london_paris_m");
        eq(0L, Math.round(Geo.haversineMeters(10, 10, 10, 10)), "same_m");
        eq(20015114L, Math.round(Geo.haversineMeters(0, 0, 0, 180)), "antipode_m");
        throwsIae(() -> Geo.haversineMeters(91, 0, 0, 0), "latitude above 90");
        throwsIae(() -> Geo.haversineMeters(0, 0, 0, -180.5), "longitude below -180");
        throwsIae(() -> Geo.haversineMeters(Double.NaN, 0, 0, 0), "NaN latitude");

        eq("9q8yyk8yt", Geo.geohashEncode(37.7749, -122.4194, 9), "gh_sf_9");
        eq("s0000", Geo.geohashEncode(0, 0, 5), "gh_zero_5");
        eq("r3gx2f7", Geo.geohashEncode(-33.8688, 151.2093, 7), "gh_sydney_7");
        roundTrip("9q8yyk8yt", 37.7749, -122.4194);
        roundTrip("s0000", 0, 0);
        roundTrip("r3gx2f7", -33.8688, 151.2093);
        roundTrip("9Q8YYK8YT", 37.7749, -122.4194);
        throwsIae(() -> Geo.geohashEncode(0, 0, 0), "precision 0");
        throwsIae(() -> Geo.geohashEncode(0, 0, 13), "precision 13");
        throwsIae(() -> Geo.geohashDecode("s0a0"), "decode rejects a");
        throwsIae(() -> Geo.geohashDecode(""), "decode rejects empty");

        Geo.Box b = Geo.boundingBox(51.5, -0.12, 10000);
        double r = 10000 - 1;
        check(Geo.haversineMeters(51.5, -0.12, b.maxLat(), -0.12) >= r, "box north side");
        check(Geo.haversineMeters(51.5, -0.12, b.minLat(), -0.12) >= r, "box south side");
        check(Geo.haversineMeters(51.5, -0.12, 51.5, b.maxLon()) >= r, "box east side");
        check(Geo.haversineMeters(51.5, -0.12, 51.5, b.minLon()) >= r, "box west side");
        check(b.maxLon() - b.minLon() > b.maxLat() - b.minLat(), "longitude span widened at 51.5N");
        Geo.Box polar = Geo.boundingBox(89.99, 0, 10000);
        check(polar.maxLat() == 90 && polar.minLon() == -180 && polar.maxLon() == 180, "polar box clamps and spans all longitudes");
        throwsIae(() -> Geo.boundingBox(0, 0, -1), "negative radius");

        System.out.println("GeoTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
