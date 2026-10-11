// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class TextWrapTest {
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
        eq("T\nh\ne\nq\nu\ni\nc\nk\nb\nr\no\nw\nn\nf\no\nx\nj\nu\nm\np\ns\no\nv\ne\nr\nt\nh\ne\nl\na\nz\ny\nd\no\ng", TextWrap.wrapText("The quick brown fox jumps over the lazy dog", 1), "wrap 0");
        eq("The\nquick\nbrown\nfox\njumps\nover\nthe\nlazy\ndog", TextWrap.wrapText("The quick brown fox jumps over the lazy dog", 5), "wrap 1");
        eq("The quick\nbrown fox\njumps over\nthe lazy\ndog", TextWrap.wrapText("The quick brown fox jumps over the lazy dog", 10), "wrap 2");
        eq("The quick brown fox\njumps over the lazy\ndog", TextWrap.wrapText("The quick brown fox jumps over the lazy dog", 20), "wrap 3");
        eq("a\nb\nc", TextWrap.wrapText("a  b\t\tc", 1), "wrap 4");
        eq("a b c", TextWrap.wrapText("a  b\t\tc", 5), "wrap 5");
        eq("a b c", TextWrap.wrapText("a  b\t\tc", 10), "wrap 6");
        eq("a b c", TextWrap.wrapText("a  b\t\tc", 20), "wrap 7");
        eq("s\nu\np\ne\nr\nc\na\nl\ni\nf\nr\na\ng\ni\nl\ni\ns\nt\ni\nc\ne\nx\np\ni\na\nl\ni\nd\no\nc\ni\no\nu\ns\nw\no\nr\nd", TextWrap.wrapText("supercalifragilisticexpialidocious word", 1), "wrap 8");
        eq("super\ncalif\nragil\nistic\nexpia\nlidoc\nious\nword", TextWrap.wrapText("supercalifragilisticexpialidocious word", 5), "wrap 9");
        eq("supercalif\nragilistic\nexpialidoc\nious word", TextWrap.wrapText("supercalifragilisticexpialidocious word", 10), "wrap 10");
        eq("supercalifragilistic\nexpialidocious word", TextWrap.wrapText("supercalifragilisticexpialidocious word", 20), "wrap 11");
        eq("l\ni\nn\ne\no\nn\ne\nl\ni\nn\ne\nt\nw\no\ni\ns\nl\no\nn\ng\ne\nr\nt\nh\na\nn\nt\ne\nn\n\ne\nn\nd", TextWrap.wrapText("line one\nline two is longer than ten\n\nend", 1), "wrap 12");
        eq("line\none\nline\ntwo\nis\nlonge\nr\nthan\nten\n\nend", TextWrap.wrapText("line one\nline two is longer than ten\n\nend", 5), "wrap 13");
        eq("line one\nline two\nis longer\nthan ten\n\nend", TextWrap.wrapText("line one\nline two is longer than ten\n\nend", 10), "wrap 14");
        eq("line one\nline two is longer\nthan ten\n\nend", TextWrap.wrapText("line one\nline two is longer than ten\n\nend", 20), "wrap 15");
        eq("c\na\nf\n\u00e9\n\ud83d\ude00\n\ud83d\ude00\n\ud83d\ude00\nn\na\n\u00ef\nv\ne", TextWrap.wrapText("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00 na\u00efve", 1), "wrap 16");
        eq("caf\u00e9\n\ud83d\ude00\ud83d\ude00\ud83d\ude00\nna\u00efve", TextWrap.wrapText("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00 na\u00efve", 5), "wrap 17");
        eq("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00\nna\u00efve", TextWrap.wrapText("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00 na\u00efve", 10), "wrap 18");
        eq("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00 na\u00efve", TextWrap.wrapText("caf\u00e9 \ud83d\ude00\ud83d\ude00\ud83d\ude00 na\u00efve", 20), "wrap 19");
        eq("t\nr\na\ni\nl\ni\nn\ng", TextWrap.wrapText("trailing   ", 1), "wrap 20");
        eq("trail\ning", TextWrap.wrapText("trailing   ", 5), "wrap 21");
        eq("trailing", TextWrap.wrapText("trailing   ", 10), "wrap 22");
        eq("trailing", TextWrap.wrapText("trailing   ", 20), "wrap 23");
        eq("", TextWrap.wrapText("", 1), "wrap 24");
        eq("", TextWrap.wrapText("", 5), "wrap 25");
        eq("", TextWrap.wrapText("", 10), "wrap 26");
        eq("", TextWrap.wrapText("", 20), "wrap 27");
        eq("c\nr\nl\nf\na\nn\nd\nc\nr", TextWrap.wrapText("crlf\r\nand\rcr", 1), "wrap 28");
        eq("crlf\nand\ncr", TextWrap.wrapText("crlf\r\nand\rcr", 5), "wrap 29");
        eq("crlf\nand\ncr", TextWrap.wrapText("crlf\r\nand\rcr", 10), "wrap 30");
        eq("crlf\nand\ncr", TextWrap.wrapText("crlf\r\nand\rcr", 20), "wrap 31");
        eq("The quick\u2026", TextWrap.truncateText("The quick brown fox jumps", 15, "\u2026"), "truncate 0");
        eq("The quick brown fox jumps", TextWrap.truncateText("The quick brown fox jumps", 100, "\u2026"), "truncate 1");
        eq("Supercali\u2026", TextWrap.truncateText("Supercalifragilistic", 10, "\u2026"), "truncate 2");
        eq("Hello...", TextWrap.truncateText("Hello world", 8, "..."), "truncate 3");
        eq("Hi there you", TextWrap.truncateText("Hi there you", 12, "\u2026"), "truncate 4");
        eq("a b\u2026", TextWrap.truncateText("a b c d e f g", 6, "\u2026"), "truncate 5");
        eq("\ud83d\ude00\ud83d\ude00\u2026", TextWrap.truncateText("\ud83d\ude00\ud83d\ude00\ud83d\ude00\ud83d\ude00", 3, "\u2026"), "truncate 6");
        eq("abc", TextWrap.truncateText("abc", 3, "..."), "truncate 7");
        eq("...", TextWrap.truncateText("abcd", 3, "..."), "truncate 8");
        eq("The quick\u2026", TextWrap.truncateText("The quick brown fox jumps", 15), "truncate default ellipsis");
        throwsIae(() -> TextWrap.wrapText("some text", 0), "invalid wrap 0");
        throwsIae(() -> TextWrap.truncateText("long text", 2, "..."), "invalid truncate 0");
        throwsIae(() -> TextWrap.truncateText("long text", 0, ""), "invalid truncate 1");

        System.out.println("TextWrapTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
