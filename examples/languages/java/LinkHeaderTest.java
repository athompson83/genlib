// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class LinkHeaderTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    /** Equality plus identical toString, so map entry order is checked too. */
    private static void eqOrd(Object expected, Object actual, String name) {
        eq(expected, actual, name);
        eq(String.valueOf(expected), String.valueOf(actual), name + " (order)");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static java.util.LinkedHashMap<String, String> omap(String... kv) {
        java.util.LinkedHashMap<String, String> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static java.util.LinkedHashMap<String, Object> omapObj(Object... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    public static void main(String[] args) {
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("https://api.test/items?page=2", omap("rel", "next")), new LinkHeader.Link("https://api.test/items?page=9", omap("rel", "last"))), LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "parse 0");
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("https://x/?a=1,2", omap("rel", "next", "title", "a, \"b\"; c"))), LinkHeader.parseLinkHeader("<https://x/?a=1,2>; rel=next; title=\"a, \\\"b\\\"; c\""), "parse 1");
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("/TheBook/chapter2", omap("rel", "previous", "title", "letztes Kapitel")), new LinkHeader.Link("/TheBook/chapter4", omap("rel", "next", "title", "n\u00E4chstes Kapitel"))), LinkHeader.parseLinkHeader("</TheBook/chapter2>; rel=\"previous\"; title*=UTF-8'de'letztes%20Kapitel, </TheBook/chapter4>; rel=\"next\"; title*=UTF-8'de'n%c3%a4chstes%20Kapitel"), "parse 2");
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("http://example.org/", omap("rel", "start index", "anchor", "#x", "hreflang", "en"))), LinkHeader.parseLinkHeader("<http://example.org/>; REL=\"Start Index\"; anchor=\"#x\"; rel=ignored; hreflang=en"), "parse 3");
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("a", omap("rel", "x", "crossorigin", ""))), LinkHeader.parseLinkHeader("<a>;rel=x;crossorigin"), "parse 4");
        eqOrd(List.<LinkHeader.Link>of(), LinkHeader.parseLinkHeader(""), "parse 5");
        eqOrd(List.<LinkHeader.Link>of(new LinkHeader.Link("a", omap("rel", "x"))), LinkHeader.parseLinkHeader("  ,  <a>; rel=x ,"), "parse 6");
        { LinkHeader.Link l = LinkHeader.findRel(LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "LAST"); eq("https://api.test/items?page=9", l == null ? null : l.uri(), "rel 0"); }
        { LinkHeader.Link l = LinkHeader.findRel(LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "prev"); eq(null, l == null ? null : l.uri(), "rel 1"); }
        eq("</a>; rel=\"next\"", LinkHeader.formatLinkHeader(List.<LinkHeader.Link>of(new LinkHeader.Link("/a", omap("rel", "next")))), "format 0");
        eq("</b>; rel=\"prev\"; title=\"Page \\\"1\\\"\"; type=\"text/html\", </c>; rel=\"next\"; title*=UTF-8''%E2%82%AC%20x", LinkHeader.formatLinkHeader(List.<LinkHeader.Link>of(new LinkHeader.Link("/b", omap("rel", "prev", "title", "Page \"1\"", "type", "text/html")), new LinkHeader.Link("/c", omap("rel", "next", "title", "\u20AC x")))), "format 1");
        throwsIae(() -> LinkHeader.parseLinkHeader("https://x; rel=next"), "invalid 0");
        throwsIae(() -> LinkHeader.parseLinkHeader("<https://x"), "invalid 1");
        throwsIae(() -> LinkHeader.parseLinkHeader("<a>; title=\"x"), "invalid 2");
        throwsIae(() -> LinkHeader.parseLinkHeader("<a> rel=x"), "invalid 3");
        throwsIae(() -> LinkHeader.parseLinkHeader("<a>; title*=UTF-8''%zz"), "invalid 4");
        throwsIae(() -> LinkHeader.parseLinkHeader("<a>; title*=KOI8-R''x"), "invalid 5");

        System.out.println("LinkHeaderTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
