// SPDX-License-Identifier: Apache-2.0
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class StructuredDataTest {
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
        Map<String, Object> org = new LinkedHashMap<>();
        org.put("@context", "https://schema.org");
        org.put("@type", "Organization");
        org.put("name", "A&B </script>");
        org.put("url", "https://ab.example");
        org.put("sameAs", List.of("https://x.com/ab"));
        eq("<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"A\\u0026B \\u003c/script\\u003e\",\"url\":\"https://ab.example\",\"sameAs\":[\"https://x.com/ab\"]}</script>",
            StructuredData.jsonLdScript(org), "json-ld vector");
        Map<String, Object> types = new LinkedHashMap<>();
        types.put("n", null);
        types.put("t", true);
        types.put("i", -3);
        types.put("f", 2.0);
        types.put("g", 4.5);
        types.put("s", "q\"\\\n\u0001\u2028\u2029\u00e9");
        types.put("o", Map.of("a", List.of()));
        eq("{\"n\":null,\"t\":true,\"i\":-3,\"f\":2,\"g\":4.5,\"s\":\"q\\\"\\\\\\n\\u0001\\u2028\\u2029\u00e9\",\"o\":{\"a\":[]}}",
            StructuredData.toSafeJson(types), "json types and escapes");
        throwsIae(() -> StructuredData.jsonLdScript(Map.of("x", Double.NaN)), "json NaN");
        throwsIae(() -> StructuredData.jsonLdScript(Map.of("x", Double.POSITIVE_INFINITY)), "json Infinity");
        throwsIae(() -> StructuredData.jsonLdScript("x"), "json-ld scalar top level");
        throwsIae(() -> StructuredData.jsonLdScript(Map.of("x", new Object())), "json unsupported type");
        Object deep = "x";
        for (int i = 0; i < 100; i++) deep = List.of(deep);
        Object deepFinal = deep;
        throwsIae(() -> StructuredData.jsonLdScript(deepFinal), "json depth limit");

        String meta = "<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name=\"description\" content=\"Cat &lt;3 mouse\">\n"
            + "<link rel=\"canonical\" href=\"https://ex.com/tj\">\n<meta property=\"og:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n"
            + "<meta property=\"og:description\" content=\"Cat &lt;3 mouse\">\n<meta property=\"og:url\" content=\"https://ex.com/tj\">\n"
            + "<meta property=\"og:image\" content=\"https://ex.com/tj.png\">\n<meta property=\"og:site_name\" content=\"Ex\">\n"
            + "<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n"
            + "<meta name=\"twitter:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta name=\"twitter:description\" content=\"Cat &lt;3 mouse\">\n"
            + "<meta name=\"twitter:image\" content=\"https://ex.com/tj.png\">";
        eq(meta, StructuredData.metaTags(new StructuredData.Meta("Tom & \"Jerry\"", "Cat <3 mouse", "https://ex.com/tj",
            "https://ex.com/tj.png", "Ex", null, null, null)), "meta vector");
        String only = StructuredData.metaTags(StructuredData.Meta.of("T"));
        eq("<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n"
            + "<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">", only, "meta title only");
        eq(5, only.split("\n").length, "meta title only has 5 lines");
        check(StructuredData.metaTags(new StructuredData.Meta("T", null, null, null, null, null, null, "en_US"))
            .contains("<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:locale\" content=\"en_US\">"), "meta locale after type");
        throwsIae(() -> StructuredData.metaTags(new StructuredData.Meta("T", null, "http://ex.com", null, null, null, null, null)), "meta http canonical");
        throwsIae(() -> StructuredData.metaTags(new StructuredData.Meta("T", null, null, "/x.png", null, null, null, null)), "meta relative image");
        throwsIae(() -> StructuredData.metaTags(new StructuredData.Meta("T", null, null, null, null, null, "big", null)), "meta bad twitter card");
        throwsIae(() -> StructuredData.metaTags(StructuredData.Meta.of(" ")), "meta empty title");

        System.out.println("StructuredDataTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
