// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class UrlTemplateTest {
    private static final Object NULL = null;
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

    /** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
    private static void near(double expected, double actual, String name) {
        check(Math.abs(expected - actual) <= Math.max(1e-9 * Math.max(Math.abs(expected), Math.abs(actual)), 1e-12),
            name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static LinkedHashMap<String, Object> omap(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    public static void main(String[] args) {
        LinkedHashMap<String, Object> vars = omap("count", List.of("one", "two", "three"), "dom", List.of("example", "com"), "dub", "me/too", "hello", "Hello World!", "half", "50%", "var", "value", "who", "fred", "base", "http://example.com/home/", "path", "/foo/bar", "list", List.of("red", "green", "blue"), "keys", omap("semi", ";", "dot", ".", "comma", ","), "v", "6", "x", "1024", "y", "768", "empty", "", "empty_keys", omap(), "empty_list", List.of(), "utf", "caf\u00e9 \u2603", "emoji", "\ud83d\ude00x");
        eq("value", UrlTemplate.expandTemplate("{var}", vars), "case 0");
        eq("Hello%20World%21", UrlTemplate.expandTemplate("{hello}", vars), "case 1");
        eq("50%25", UrlTemplate.expandTemplate("{half}", vars), "case 2");
        eq("OX", UrlTemplate.expandTemplate("O{empty}X", vars), "case 3");
        eq("OX", UrlTemplate.expandTemplate("O{undef}X", vars), "case 4");
        eq("1024,768", UrlTemplate.expandTemplate("{x,y}", vars), "case 5");
        eq("1024,Hello%20World%21,768", UrlTemplate.expandTemplate("{x,hello,y}", vars), "case 6");
        eq("?1024,", UrlTemplate.expandTemplate("?{x,empty}", vars), "case 7");
        eq("?1024", UrlTemplate.expandTemplate("?{x,undef}", vars), "case 8");
        eq("?768", UrlTemplate.expandTemplate("?{undef,y}", vars), "case 9");
        eq("val", UrlTemplate.expandTemplate("{var:3}", vars), "case 10");
        eq("value", UrlTemplate.expandTemplate("{var:30}", vars), "case 11");
        eq("red,green,blue", UrlTemplate.expandTemplate("{list}", vars), "case 12");
        eq("red,green,blue", UrlTemplate.expandTemplate("{list*}", vars), "case 13");
        eq("semi,%3B,dot,.,comma,%2C", UrlTemplate.expandTemplate("{keys}", vars), "case 14");
        eq("semi=%3B,dot=.,comma=%2C", UrlTemplate.expandTemplate("{keys*}", vars), "case 15");
        eq("value", UrlTemplate.expandTemplate("{+var}", vars), "case 16");
        eq("Hello%20World!", UrlTemplate.expandTemplate("{+hello}", vars), "case 17");
        eq("50%25", UrlTemplate.expandTemplate("{+half}", vars), "case 18");
        eq("http%3A%2F%2Fexample.com%2Fhome%2Findex", UrlTemplate.expandTemplate("{base}index", vars), "case 19");
        eq("http://example.com/home/index", UrlTemplate.expandTemplate("{+base}index", vars), "case 20");
        eq("/foo/b/here", UrlTemplate.expandTemplate("{+path:6}/here", vars), "case 21");
        eq("red,green,blue", UrlTemplate.expandTemplate("{+list}", vars), "case 22");
        eq("semi=;,dot=.,comma=,", UrlTemplate.expandTemplate("{+keys*}", vars), "case 23");
        eq("#value", UrlTemplate.expandTemplate("{#var}", vars), "case 24");
        eq("#Hello%20World!", UrlTemplate.expandTemplate("{#hello}", vars), "case 25");
        eq("#/foo/b/here", UrlTemplate.expandTemplate("{#path:6}/here", vars), "case 26");
        eq("#semi=;,dot=.,comma=,", UrlTemplate.expandTemplate("{#keys*}", vars), "case 27");
        eq("X.value", UrlTemplate.expandTemplate("X{.var}", vars), "case 28");
        eq("X.val", UrlTemplate.expandTemplate("X{.var:3}", vars), "case 29");
        eq("X.red.green.blue", UrlTemplate.expandTemplate("X{.list*}", vars), "case 30");
        eq(".example.com", UrlTemplate.expandTemplate("{.dom*}", vars), "case 31");
        eq("/value", UrlTemplate.expandTemplate("{/var}", vars), "case 32");
        eq("/v/value", UrlTemplate.expandTemplate("{/var:1,var}", vars), "case 33");
        eq("/red/green/blue/%2Ffoo", UrlTemplate.expandTemplate("{/list*,path:4}", vars), "case 34");
        eq("/semi=%3B/dot=./comma=%2C", UrlTemplate.expandTemplate("{/keys*}", vars), "case 35");
        eq(";hello=Hello", UrlTemplate.expandTemplate("{;hello:5}", vars), "case 36");
        eq(";list=red;list=green;list=blue", UrlTemplate.expandTemplate("{;list*}", vars), "case 37");
        eq(";semi=%3B;dot=.;comma=%2C", UrlTemplate.expandTemplate("{;keys*}", vars), "case 38");
        eq(";x=1024;y=768;empty", UrlTemplate.expandTemplate("{;x,y,empty}", vars), "case 39");
        eq("?x=1024&y=768&empty=", UrlTemplate.expandTemplate("{?x,y,empty}", vars), "case 40");
        eq("?var=val", UrlTemplate.expandTemplate("{?var:3}", vars), "case 41");
        eq("?list=red,green,blue", UrlTemplate.expandTemplate("{?list}", vars), "case 42");
        eq("?list=red&list=green&list=blue", UrlTemplate.expandTemplate("{?list*}", vars), "case 43");
        eq("?keys=semi,%3B,dot,.,comma,%2C", UrlTemplate.expandTemplate("{?keys}", vars), "case 44");
        eq("?semi=%3B&dot=.&comma=%2C", UrlTemplate.expandTemplate("{?keys*}", vars), "case 45");
        eq("&var=val", UrlTemplate.expandTemplate("{&var:3}", vars), "case 46");
        eq("&semi=%3B&dot=.&comma=%2C", UrlTemplate.expandTemplate("{&keys*}", vars), "case 47");
        eq("", UrlTemplate.expandTemplate("{?empty_keys*}", vars), "case 48");
        eq("", UrlTemplate.expandTemplate("{?empty_list}", vars), "case 49");
        eq("/one/two/three", UrlTemplate.expandTemplate("{/count*}", vars), "case 50");
        eq("caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{utf}", vars), "case 51");
        eq("caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{+utf}", vars), "case 52");
        eq("%F0%9F%98%80", UrlTemplate.expandTemplate("{emoji:1}", vars), "case 53");
        eq("?utf=caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{?utf}", vars), "case 54");
        eq("map?1024,768#Hello%20World%21", UrlTemplate.expandTemplate("map?{x,y}#{hello}", vars), "case 55");
        eq("literal%20kept/value", UrlTemplate.expandTemplate("literal%20kept/{var}", vars), "case 56");
        eq("sp%20acevalue", UrlTemplate.expandTemplate("sp ace{var}", vars), "case 57");
        throwsIae(() -> UrlTemplate.expandTemplate("{var", vars), "invalid 0");
        throwsIae(() -> UrlTemplate.expandTemplate("var}", vars), "invalid 1");
        throwsIae(() -> UrlTemplate.expandTemplate("{}", vars), "invalid 2");
        throwsIae(() -> UrlTemplate.expandTemplate("{=var}", vars), "invalid 3");
        throwsIae(() -> UrlTemplate.expandTemplate("{!var}", vars), "invalid 4");
        throwsIae(() -> UrlTemplate.expandTemplate("{@var}", vars), "invalid 5");
        throwsIae(() -> UrlTemplate.expandTemplate("{|var}", vars), "invalid 6");
        throwsIae(() -> UrlTemplate.expandTemplate("{var:0}", vars), "invalid 7");
        throwsIae(() -> UrlTemplate.expandTemplate("{var:10000}", vars), "invalid 8");
        throwsIae(() -> UrlTemplate.expandTemplate("{va r}", vars), "invalid 9");
        throwsIae(() -> UrlTemplate.expandTemplate("{list:3}", vars), "invalid 10");
        throwsIae(() -> UrlTemplate.expandTemplate("{keys:2}", vars), "invalid 11");
        throwsIae(() -> UrlTemplate.expandTemplate("{var:01}", vars), "invalid 12");
        eq("", UrlTemplate.expandTemplate("{nothing}", omap()), "no variables");

        System.out.println("UrlTemplateTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
