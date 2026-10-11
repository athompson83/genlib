// SPDX-License-Identifier: Apache-2.0

import java.util.List;

public final class TextChunkingTest {
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

    public static void main(String[] args) {
        eq(List.of("First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0), "case 0");
        eq(List.of("First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15), "case 1");
        eq(List.of("First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0), "case 2");
        eq(List.of("First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4), "case 3");
        eq(List.of("Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0), "case 4");
        eq(List.of("First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4), "case 5");
        eq(List.of("F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0), "case 6");
        eq(List.of("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird."), TextChunking.chunkText("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50), "case 7");
        eq(List.of("abcdefghij"), TextChunking.chunkText("abcdefghij", 60, 0), "case 8");
        eq(List.of("abcdefghij"), TextChunking.chunkText("abcdefghij", 40, 15), "case 9");
        eq(List.of("abcdefghij"), TextChunking.chunkText("abcdefghij", 10, 0), "case 10");
        eq(List.of("abcdefghij"), TextChunking.chunkText("abcdefghij", 10, 4), "case 11");
        eq(List.of("abcd", "efgh", "ij"), TextChunking.chunkText("abcdefghij", 4, 0), "case 12");
        eq(List.of("abcdefghi", "fghij"), TextChunking.chunkText("abcdefghij", 9, 4), "case 13");
        eq(List.of("a", "b", "c", "d", "e", "f", "g", "h", "i", "j"), TextChunking.chunkText("abcdefghij", 1, 0), "case 14");
        eq(List.of("abcdefghij"), TextChunking.chunkText("abcdefghij", 200, 50), "case 15");
        eq(List.of("one two three four five"), TextChunking.chunkText("one two three four five", 60, 0), "case 16");
        eq(List.of("one two three four five"), TextChunking.chunkText("one two three four five", 40, 15), "case 17");
        eq(List.of("one two", "three", "four five"), TextChunking.chunkText("one two three four five", 10, 0), "case 18");
        eq(List.of("one two", "two three", "four five"), TextChunking.chunkText("one two three four five", 10, 4), "case 19");
        eq(List.of("one", "two", "thre", "e fo", "ur", "five"), TextChunking.chunkText("one two three four five", 4, 0), "case 20");
        eq(List.of("one two", "three", "four five"), TextChunking.chunkText("one two three four five", 9, 4), "case 21");
        eq(List.of("o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e"), TextChunking.chunkText("one two three four five", 1, 0), "case 22");
        eq(List.of("one two three four five"), TextChunking.chunkText("one two three four five", 200, 50), "case 23");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 60, 0), "case 24");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 40, 15), "case 25");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 10, 0), "case 26");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 10, 4), "case 27");
        eq(List.of("A.", "B.", "C."), TextChunking.chunkText("A. B. C.", 4, 0), "case 28");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 9, 4), "case 29");
        eq(List.of("A", ".", "B", ".", "C", "."), TextChunking.chunkText("A. B. C.", 1, 0), "case 30");
        eq(List.of("A. B. C."), TextChunking.chunkText("A. B. C.", 200, 50), "case 31");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 60, 0), "case 32");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 40, 15), "case 33");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 10, 0), "case 34");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 10, 4), "case 35");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 4, 0), "case 36");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 9, 4), "case 37");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 1, 0), "case 38");
        eq(List.of(), TextChunking.chunkText("  \n\n  ", 200, 50), "case 39");
        eq(List.of(), TextChunking.chunkText("", 60, 0), "case 40");
        eq(List.of(), TextChunking.chunkText("", 40, 15), "case 41");
        eq(List.of(), TextChunking.chunkText("", 10, 0), "case 42");
        eq(List.of(), TextChunking.chunkText("", 10, 4), "case 43");
        eq(List.of(), TextChunking.chunkText("", 4, 0), "case 44");
        eq(List.of(), TextChunking.chunkText("", 9, 4), "case 45");
        eq(List.of(), TextChunking.chunkText("", 1, 0), "case 46");
        eq(List.of(), TextChunking.chunkText("", 200, 50), "case 47");
        eq(List.of("Line one\nLine two\nLine three\nLine four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 60, 0), "case 48");
        eq(List.of("Line one\nLine two\nLine three\nLine four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 40, 15), "case 49");
        eq(List.of("Line one", "Line two", "Line", "three", "Line four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 10, 0), "case 50");
        eq(List.of("Line one", "Line two", "Line", "three", "Line four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 10, 4), "case 51");
        eq(List.of("Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 4, 0), "case 52");
        eq(List.of("Line one", "Line two", "Line", "three", "Line four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 9, 4), "case 53");
        eq(List.of("L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 1, 0), "case 54");
        eq(List.of("Line one\nLine two\nLine three\nLine four"), TextChunking.chunkText("Line one\nLine two\nLine three\nLine four", 200, 50), "case 55");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 60, 0), "case 56");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 40, 15), "case 57");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 10, 0), "case 58");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 10, 4), "case 59");
        eq(List.of("Shor", "t."), TextChunking.chunkText("Short.", 4, 0), "case 60");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 9, 4), "case 61");
        eq(List.of("S", "h", "o", "r", "t", "."), TextChunking.chunkText("Short.", 1, 0), "case 62");
        eq(List.of("Short."), TextChunking.chunkText("Short.", 200, 50), "case 63");
        eq(List.of("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 60, 0), "case 64");
        eq(List.of("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 40, 15), "case 65");
        eq(List.of("Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 10, 0), "case 66");
        eq(List.of("Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 10, 4), "case 67");
        eq(List.of("Caf\u00E9", "na\u00EF", "ve r", "\u00E9sum", "\u00E9 \u2014", "\u65E5\u672C\u8A9E\u306E", "\u30C6\u30AD\u30B9\u30C8", "\u3002", "End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 4, 0), "case 68");
        eq(List.of("Caf\u00E9", "na\u00EFve", "r\u00E9sum\u00E9 \u2014", "\u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9", "\u306E\u30C6\u30AD\u30B9\u30C8\u3002", "\u30B9\u30C8\u3002 End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 9, 4), "case 69");
        eq(List.of("C", "a", "f", "\u00E9", "n", "a", "\u00EF", "v", "e", "r", "\u00E9", "s", "u", "m", "\u00E9", "\u2014", "\u65E5", "\u672C", "\u8A9E", "\u306E", "\u30C6", "\u30AD", "\u30B9", "\u30C8", "\u3002", "E", "n", "d", "."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 1, 0), "case 70");
        eq(List.of("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End."), TextChunking.chunkText("Caf\u00E9 na\u00EFve r\u00E9sum\u00E9 \u2014 \u65E5\u672C\u8A9E\u306E\u30C6\u30AD\u30B9\u30C8\u3002 End.", 200, 50), "case 71");
        eq(List.of("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0), "case 72");
        eq(List.of("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15), "case 73");
        eq(List.of("xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0), "case 74");
        eq(List.of("xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4), "case 75");
        eq(List.of("xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0), "case 76");
        eq(List.of("xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4), "case 77");
        eq(List.of("x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0), "case 78");
        eq(List.of("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"), TextChunking.chunkText("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50), "case 79");
        eq(List.of("Mr. Smith went. Then? Yes! Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 60, 0), "case 80");
        eq(List.of("Mr. Smith went. Then? Yes! Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 40, 15), "case 81");
        eq(List.of("Mr. Smith", "went.", "Then?", "Yes! Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 10, 0), "case 82");
        eq(List.of("Mr. Smith", "went.", "Then?", "Yes! Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 10, 4), "case 83");
        eq(List.of("Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 4, 0), "case 84");
        eq(List.of("Mr.", "Smith", "went.", "Then?", "Yes!", "Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 9, 4), "case 85");
        eq(List.of("M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 1, 0), "case 86");
        eq(List.of("Mr. Smith went. Then? Yes! Done."), TextChunking.chunkText("Mr. Smith went. Then? Yes! Done.", 200, 50), "case 87");
        eq(List.of("\uD83D\uDE00\uD83D\uDE00", "\uD83D\uDE00"), TextChunking.chunkText("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", 2), "code points, not UTF-16 units");
        throwsIae(() -> TextChunking.chunkText("x", 0, 0), "invalid 0");
        throwsIae(() -> TextChunking.chunkText("x", 5, 5), "invalid 1");
        throwsIae(() -> TextChunking.chunkText("x", 5, -1), "invalid 2");
        throwsIae(() -> TextChunking.chunkText("x", -3, 0), "invalid 3");

        System.out.println("TextChunkingTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
