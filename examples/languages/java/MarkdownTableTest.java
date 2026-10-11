// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class MarkdownTableTest {
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
        eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(List.of("Name", "Qty"), List.<List<String>>of(List.of("Apple", "3"), List.of("Kiwi", "12")), null), "table 0");
        eq("| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |", MarkdownTable.markdownTable(List.of("a", "b", "c"), List.<List<String>>of(List.of("1", "2", "3")), Arrays.asList(new String[] {"left", "right", "center"})), "table 1");
        eq("| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |", MarkdownTable.markdownTable(List.of("Pipe|col", "Text"), List.<List<String>>of(List.of("a|b", "line1\nline2"), List.of("back\\slash", "crlf\r\nx")), null), "table 2");
        eq("|  x  |\n| :-: |", MarkdownTable.markdownTable(List.of("x"), List.<List<String>>of(), Arrays.asList(new String[] {"center"})), "table 3");
        eq("|  Caf\u00e9 | \ud83d\ude00   |\n| ----: | --- |\n| na\u00efve | ok  |", MarkdownTable.markdownTable(List.of("Caf\u00e9", "\ud83d\ude00"), List.<List<String>>of(List.of("na\u00efve", "ok")), Arrays.asList(new String[] {"right", null})), "table 4");
        eq("|    wide    |\n| :--------: |\n| abcdefghij |", MarkdownTable.markdownTable(List.of("wide"), List.<List<String>>of(List.of("abcdefghij")), Arrays.asList(new String[] {"center"})), "table 5");
        eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(List.of("Name", "Qty"), List.<List<String>>of(List.of("Apple", "3"), List.of("Kiwi", "12"))), "table default align");
        eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(List.of("Name", "Qty"), List.<List<String>>of(List.of("Apple", "3"), List.of("Kiwi", "12")), List.of("none", "none")), "table none align");
        throwsIae(() -> MarkdownTable.markdownTable(List.of(), List.<List<String>>of(), null), "invalid 0");
        throwsIae(() -> MarkdownTable.markdownTable(List.of("a", "b"), List.<List<String>>of(List.of("1")), null), "invalid 1");
        throwsIae(() -> MarkdownTable.markdownTable(List.of("a"), List.<List<String>>of(List.of("1")), Arrays.asList(new String[] {"middle"})), "invalid 2");

        System.out.println("MarkdownTableTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
