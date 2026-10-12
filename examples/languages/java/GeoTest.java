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

        // Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
        Geo.Box wide = Geo.boundingBox(60, 0, 0.1 * Geo.EARTH_RADIUS_M);
        double half = Math.toRadians(wide.maxLon());
        double want = Math.asin(Math.sin(0.1) / Math.cos(Math.toRadians(60)));
        check(Math.abs(half - want) <= 1e-6 * want && Math.abs(half - 0.20101) < 1e-5, "lat 60 r 0.1 half-width " + half + " want " + want);
        check(Math.abs(wide.minLon() + wide.maxLon()) < 1e-12, "lat 60 box symmetric");
        boolean allInside = true;
        for (double cLat : new double[] {0, 45, 60, 75, -70}) {
            for (double radius : new double[] {1_000, 100_000, 1_000_000}) {
                Geo.Box box = Geo.boundingBox(cLat, 0, radius);
                double d = radius / Geo.EARTH_RADIUS_M;
                double p1 = Math.toRadians(cLat);
                for (int i = 0; i < 360; i++) {
                    double t = Math.toRadians(i);
                    double p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
                    double l2 = Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
                    double pLat = Math.toDegrees(p2), pLon = Math.toDegrees(l2);
                    if (pLat < box.minLat() - 1e-9 || pLat > box.maxLat() + 1e-9 || pLon < box.minLon() - 1e-9 || pLon > box.maxLon() + 1e-9) {
                        if (allInside) System.err.println("outside: center " + cLat + ", radius " + radius + ", bearing " + i + ": " + pLat + "," + pLon + " " + box);
                        allInside = false;
                    }
                }
            }
        }
        check(allInside, "circle points at 360 bearings lie inside the box");
        for (double[] c : new double[][] {{179.9, 90}, {-179.9, 270}}) {
            Geo.Box box = Geo.boundingBox(10, c[0], 50_000);
            check(box.minLon() == -180 && box.maxLon() == 180, "antimeridian center lon " + c[0] + " spans all longitudes " + box);
            double d = 50_000 / Geo.EARTH_RADIUS_M, p1 = Math.toRadians(10), t = Math.toRadians(c[1]);
            double p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
            double l2 = Math.toRadians(c[0]) + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
            double pLat = Math.toDegrees(p2), pLon = ((Math.toDegrees(l2) + 540) % 360) - 180;
            check(Math.abs(pLon) > 179.5 && pLat >= box.minLat() && pLat <= box.maxLat() && pLon >= box.minLon() && pLon <= box.maxLon(),
                "antimeridian far-side point " + pLat + "," + pLon + " inside " + box);
        }

        System.out.println("GeoTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
