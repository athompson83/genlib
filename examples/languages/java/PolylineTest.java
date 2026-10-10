// SPDX-License-Identifier: Apache-2.0
import java.util.List;

public final class PolylineTest {
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

    private static void sameWithin(double[][] expected, List<double[]> actual, double tol, String name) {
        boolean ok = expected.length == actual.size();
        for (int i = 0; ok && i < expected.length; i++) {
            ok = Math.abs(expected[i][0] - actual.get(i)[0]) <= tol && Math.abs(expected[i][1] - actual.get(i)[1]) <= tol;
        }
        check(ok, name);
    }

    public static void main(String[] args) {
        double[][] google = {{38.5, -120.2}, {40.7, -120.95}, {43.252, -126.453}};
        eq("_p~iF~ps|U_ulLnnqC_mqNvxq`@", Polyline.encodePolyline(google), "encode google");
        sameWithin(google, Polyline.decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), 1e-12, "decode google");
        double[][] p6 = {{47.6062, -122.3321}, {47.6205, -122.3493}};
        eq("ozsxyAf{pihFw|Z~q`@", Polyline.encodePolyline(p6, 6), "encode precision 6");
        sameWithin(p6, Polyline.decodePolyline("ozsxyAf{pihFw|Z~q`@", 6), 1e-12, "decode precision 6");
        eq("", Polyline.encodePolyline(new double[0][]), "encode empty");
        eq(0, Polyline.decodePolyline("").size(), "decode empty");
        double[][] odd = {{-0.000005, 179.999995}, {12.345678, -45.678901}, {-89.99999, 0.000004}};
        sameWithin(odd, Polyline.decodePolyline(Polyline.encodePolyline(odd)), 0.5e-5, "round trip precision 5");
        sameWithin(odd, Polyline.decodePolyline(Polyline.encodePolyline(odd, 6), 6), 0.5e-6, "round trip precision 6");
        throwsIae(() -> Polyline.decodePolyline("_p~iF~ps|"), "truncated value");
        throwsIae(() -> Polyline.decodePolyline("_p~iF"), "missing longitude");
        throwsIae(() -> Polyline.decodePolyline("_p~iF ~ps|U"), "space is outside 63..126");
        throwsIae(() -> Polyline.decodePolyline("ÿ"), "non-ASCII character");
        throwsIae(() -> Polyline.encodePolyline(new double[][] {{Double.NaN, 0}}), "NaN point");
        throwsIae(() -> Polyline.encodePolyline(google, -1), "negative precision");

        System.out.println("PolylineTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
