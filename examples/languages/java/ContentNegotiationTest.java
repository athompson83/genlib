// SPDX-License-Identifier: Apache-2.0
import java.util.List;

/** Wave 6 vectors (shared with every Genlib language) for content-negotiation. */
public final class ContentNegotiationTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        List<String> media = List.of("application/json", "text/html", "text/csv");
        eq("application/json", ContentNegotiation.negotiateMediaType("application/json", media), "media " + "application/json");
        eq("text/html", ContentNegotiation.negotiateMediaType("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", media), "media " + "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        eq("text/html", ContentNegotiation.negotiateMediaType("text/*;q=0.5, application/json;q=0.4", media), "media " + "text/*;q=0.5, application/json;q=0.4");
        eq("application/json", ContentNegotiation.negotiateMediaType("*/*", media), "media " + "*/*");
        eq("text/html", ContentNegotiation.negotiateMediaType("text/csv;q=0, text/*", media), "media " + "text/csv;q=0, text/*");
        eq(null, ContentNegotiation.negotiateMediaType("image/png", media), "media " + "image/png");
        eq(null, ContentNegotiation.negotiateMediaType("application/json;q=0", media), "media " + "application/json;q=0");
        eq("text/html", ContentNegotiation.negotiateMediaType("TEXT/HTML", media), "media " + "TEXT/HTML");
        eq("text/csv", ContentNegotiation.negotiateMediaType("text/html;q=1.5, text/csv", media), "media " + "text/html;q=1.5, text/csv");
        eq("application/json", ContentNegotiation.negotiateMediaType(null, media), "media " + null);
        eq("application/json", ContentNegotiation.negotiateMediaType("", media), "media " + "");
        eq("application/json", ContentNegotiation.negotiateMediaType("application/*;q=0.2, */*;q=0.1", media), "media " + "application/*;q=0.2, */*;q=0.1");
        eq("text/html", ContentNegotiation.negotiateMediaType("text/html;level=1;q=0.7, text/csv;q=0.7", media), "media " + "text/html;level=1;q=0.7, text/csv;q=0.7");
        List<String> langs = List.of("en", "en-GB", "fr", "pt-BR");
        eq("fr", ContentNegotiation.negotiateLanguage("fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5", langs), "language " + "fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5");
        eq("en-GB", ContentNegotiation.negotiateLanguage("en-GB", langs), "language " + "en-GB");
        eq("en", ContentNegotiation.negotiateLanguage("en-US,en;q=0.9", langs), "language " + "en-US,en;q=0.9");
        eq("pt-BR", ContentNegotiation.negotiateLanguage("pt", langs), "language " + "pt");
        eq(null, ContentNegotiation.negotiateLanguage("de", langs), "language " + "de");
        eq("en", ContentNegotiation.negotiateLanguage("de, *;q=0.1", langs), "language " + "de, *;q=0.1");
        eq("fr", ContentNegotiation.negotiateLanguage("en;q=0, *", langs), "language " + "en;q=0, *");
        eq("pt-BR", ContentNegotiation.negotiateLanguage("PT-br", langs), "language " + "PT-br");
        eq("en", ContentNegotiation.negotiateLanguage(null, langs), "language " + null);
        eq(null, ContentNegotiation.negotiateLanguage("zh-Hant-TW", langs), "language " + "zh-Hant-TW");

        System.out.println("ContentNegotiationTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
