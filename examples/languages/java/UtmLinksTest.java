// SPDX-License-Identifier: Apache-2.0
import java.util.List;
import java.util.Map;

public final class UtmLinksTest {
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

    public static void main(String[] args) {
        eq("https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top",
            UtmLinks.buildUtmUrl("https://ex.com/p?ref=a#top", UtmLinks.Utm.of("Newsletter", "email", "Fall Sale")), "build vector 1");
        eq("https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta",
            UtmLinks.buildUtmUrl("https://ex.com/?utm_source=old", new UtmLinks.Utm("x", "y", "z", null, "Hero CTA", null)), "build vector 2");
        eq("http://ex.com?utm_id=id-7&utm_source=s&utm_medium=m&utm_campaign=c&utm_term=running%20shoes&utm_content=a%2Fb",
            UtmLinks.buildUtmUrl("http://ex.com", new UtmLinks.Utm(" S ", "m", "c", "Running Shoes", "a/b", "ID-7")), "build all keys in order");
        throwsIae(() -> UtmLinks.buildUtmUrl("ex.com/p", UtmLinks.Utm.of("s", "m", "c")), "build relative base");
        throwsIae(() -> UtmLinks.buildUtmUrl("ftp://ex.com/", UtmLinks.Utm.of("s", "m", "c")), "build ftp base");
        throwsIae(() -> UtmLinks.buildUtmUrl("https:///p", UtmLinks.Utm.of("s", "m", "c")), "build missing host");
        throwsIae(() -> UtmLinks.buildUtmUrl("https://ex.com/", UtmLinks.Utm.of("s", "m", "  ")), "build blank campaign");
        throwsIae(() -> UtmLinks.buildUtmUrl("https://ex.com/", UtmLinks.Utm.of("", "m", "c")), "build empty source");

        Map<String, String> parsed = UtmLinks.parseUtm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup");
        eq(List.of("source", "campaign"), List.copyOf(parsed.keySet()), "parse key order");
        eq("news letter", parsed.get("source"), "parse plus as space, first wins");
        eq("fall sale", parsed.get("campaign"), "parse percent decode");
        check(UtmLinks.parseUtm("https://ex.com/").isEmpty(), "parse no query");
        eq("\u20ac", UtmLinks.parseUtm("https://ex.com/?utm_source=%E2%82%AC#x").get("source"), "parse UTF-8");
        throwsIae(() -> UtmLinks.parseUtm("https://ex.com/?utm_source=%zz"), "parse malformed encoding");

        eq("https://ex.com/p?id=7&b=2#s", UtmLinks.stripTracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"), "strip vector 1");
        eq("https://ex.com/", UtmLinks.stripTracking("https://ex.com/?fbclid=1"), "strip vector 2");
        eq("https://ex.com/?q=a%20b", UtmLinks.stripTracking("https://ex.com/?q=a%20b&igshid=9&_hsenc=x"), "strip keeps original encoding");

        System.out.println("UtmLinksTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
