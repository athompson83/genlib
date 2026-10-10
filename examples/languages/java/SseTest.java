// SPDX-License-Identifier: Apache-2.0

public final class SseTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void near(double expected, double actual, double tol, String name) {
        check(Math.abs(expected - actual) <= tol, name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void nearAll(double[] expected, double[] actual, double tol, String name) {
        check(expected.length == actual.length, name + " length");
        for (int i = 0; i < Math.min(expected.length, actual.length); i++) near(expected[i], actual[i], tol, name + "[" + i + "]");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void checkEvents(java.util.List<Sse.Event> got, String[][] exp, String name) {
        eq(exp.length, got.size(), name + " count");
        for (int i = 0; i < Math.min(exp.length, got.size()); i++) eq(new Sse.Event(exp[i][0], exp[i][1], exp[i][2]), got.get(i), name + " event " + i);
    }

    private static void parseCase(String text, String[][] exp, Long retry, String name) {
        checkEvents(Sse.parse(text), exp, name);
        Sse.Parser p = new Sse.Parser();
        p.feed(text);
        eq(retry, p.retry(), name + " retry");
    }

    private static void chunkedCase(String[] chunks, String[][] exp, String name) {
        Sse.Parser p = new Sse.Parser();
        java.util.List<Sse.Event> got = new java.util.ArrayList<>();
        for (String c : chunks) got.addAll(p.feed(c));
        checkEvents(got, exp, name);
    }

    public static void main(String[] args) {
        parseCase("data: YHOO\ndata: +2\ndata: 10\n\n", new String[][] {{"message", "YHOO\n+2\n10", ""}}, null, "parse 0");
        parseCase(": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", new String[][] {{"message", "first event", "1"}, {"message", "second event", ""}}, null, "parse 1");
        parseCase("data\n\ndata\ndata\n\ndata:", new String[][] {{"message", "", ""}, {"message", "\n", ""}}, null, "parse 2");
        parseCase("data:test\n\ndata: test\n\n", new String[][] {{"message", "test", ""}, {"message", "test", ""}}, null, "parse 3");
        parseCase("event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", new String[][] {{"add", "73857293", ""}, {"remove", "2153", ""}, {"add", "113411", ""}}, null, "parse 4");
        parseCase("\uFEFFdata: bom\n\n", new String[][] {{"message", "bom", ""}}, null, "parse 5");
        parseCase("data: a\r\ndata: b\r\rdata: c\n\n", new String[][] {{"message", "a\nb", ""}, {"message", "c", ""}}, null, "parse 6");
        parseCase("id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", new String[][] {{"message", "x", "7"}, {"message", "y", "7"}, {"message", "z", ""}}, null, "parse 7");
        parseCase("id: a\000b\ndata: nul\n\n", new String[][] {{"message", "nul", ""}}, null, "parse 8");
        parseCase("retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", new String[][] {{"message", "r", ""}, {"message", "s", ""}}, 1500L, "parse 9");
        parseCase("event\ndata: e\n\n", new String[][] {{"message", "e", ""}}, null, "parse 10");
        parseCase("unknown: q\ndata: u\n\n", new String[][] {{"message", "u", ""}}, null, "parse 11");
        parseCase(":\n:comment\ndata: ok\n\n", new String[][] {{"message", "ok", ""}}, null, "parse 12");
        parseCase("data: no blank line at end", new String[][] {}, null, "parse 13");
        chunkedCase(new String[] {"data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"}, new String[][] {{"message", "YHOO\n+2\n10", ""}}, "chunked 0");
        chunkedCase(new String[] {": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"}, new String[][] {{"message", "first event", "1"}, {"message", "second event", ""}}, "chunked 1");
        chunkedCase(new String[] {"da", "ta\n\nda", "ta\ndata", "\n\ndata:"}, new String[][] {{"message", "", ""}, {"message", "\n", ""}}, "chunked 2");
        chunkedCase(new String[] {"data", ":t", "est\n\nd", "ata: test\n\n"}, new String[][] {{"message", "test", ""}, {"message", "test", ""}}, "chunked 3");
        chunkedCase(new String[] {"event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"}, new String[][] {{"add", "73857293", ""}, {"remove", "2153", ""}, {"add", "113411", ""}}, "chunked 4");
        chunkedCase(new String[] {"\uFEFFd", "at", "a: bo", "m\n\n"}, new String[][] {{"message", "bom", ""}}, "chunked 5");
        chunkedCase(new String[] {"d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"}, new String[][] {{"message", "a\nb", ""}, {"message", "c", ""}}, "chunked 6");
        chunkedCase(new String[] {"id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"}, new String[][] {{"message", "x", "7"}, {"message", "y", "7"}, {"message", "z", ""}}, "chunked 7");
        chunkedCase(new String[] {"id:", " a\000", "b\ndata:", " nul\n\n"}, new String[][] {{"message", "nul", ""}}, "chunked 8");
        chunkedCase(new String[] {"r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"}, new String[][] {{"message", "r", ""}, {"message", "s", ""}}, "chunked 9");
        eq("data: hello\n\n", Sse.format("hello", null, null, null), "format 0");
        eq("event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n", Sse.format("a\nb\r\nc", "update", "42", null), "format 1");
        eq("retry: 3000\ndata: \n\n", Sse.format("", null, null, 3000L), "format 2");
        eq("event: json\nid: \ndata: {\"x\":1}\n\n", Sse.format("{\"x\":1}", "json", "", null), "format 3");
        throwsIae(() -> Sse.format("x", "a\nb", null, null), "format_invalid 0");
        throwsIae(() -> Sse.format("x", null, "a\rb", null), "format_invalid 1");
        throwsIae(() -> Sse.format("x", null, "a\000", null), "format_invalid 2");
        throwsIae(() -> Sse.format("x", null, null, -1L), "format_invalid 3");
        eq(":\n\n", Sse.formatComment(""), "comment 0");
        eq(": ping\n\n", Sse.formatComment("ping"), "comment 1");
        eq(":\n\n", Sse.formatComment(), "comment default");
        throwsIae(() -> Sse.formatComment("a\nb"), "comment with line break");
        eq("data: x\n\n", Sse.format("x"), "format data only");

        System.out.println("SseTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
