// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.

/** Wave 7 vectors (shared with every Genlib language) for text-sanitize. */
public final class TextSanitizeTest {
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
        eq("plain text", TextSanitize.sanitizeText("plain text"), "sanitize 0");
        eq("line1\nline2\nline3", TextSanitize.sanitizeText("line1\r\nline2\rline3"), "sanitize 1");
        eq("zerowidthbom", TextSanitize.sanitizeText("zero\u200Bwidth\uFEFFbom"), "sanitize 2");
        eq("tab\therenuldelnel", TextSanitize.sanitizeText("tab\there\000nul\177del\205nel"), "sanitize 3");
        eq("if (accessLevel != \"user // Check if admin \") {", TextSanitize.sanitizeText("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {"), "sanitize 4");
        eq("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family", TextSanitize.sanitizeText("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"), "sanitize 5");
        eq("caf\u00E9 e\u0301", TextSanitize.sanitizeText("caf\u00E9 e\u0301"), "sanitize 6");
        eq("a b c", TextSanitize.sanitizeText("a\nb\r\nc", new TextSanitize.Options().allowNewlines(false)), "sanitize 7");
        eq("abc", TextSanitize.sanitizeText("abcdef", new TextSanitize.Options().maxLength(3)), "sanitize 8");
        eq("\uD83D\uDE00\uD83D\uDE00", TextSanitize.sanitizeText("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", new TextSanitize.Options().maxLength(2)), "sanitize 9");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("plain text"), "findBidi 0");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("line1\r\nline2\rline3"), "findBidi 1");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("zero\u200Bwidth\uFEFFbom"), "findBidi 2");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("tab\there\000nul\177del\205nel"), "findBidi 3");
        eq(java.util.List.<TextSanitize.BidiControl>of(new TextSanitize.BidiControl(24, "202E"), new TextSanitize.BidiControl(26, "2066"), new TextSanitize.BidiControl(44, "2069"), new TextSanitize.BidiControl(46, "2066")), TextSanitize.findBidiControls("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {"), "findBidi 4");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"), "findBidi 5");
        eq(java.util.List.<TextSanitize.BidiControl>of(), TextSanitize.findBidiControls("caf\u00E9 e\u0301"), "findBidi 6");
        eq("a b c d", TextSanitize.normalizeWhitespace("  a   b\t\tc\n\nd  "), "normalizeWhitespace 0");
        eq("", TextSanitize.normalizeWhitespace(""), "normalizeWhitespace 1");
        eq("", TextSanitize.normalizeWhitespace(" \t\n "), "normalizeWhitespace 2");
        eq("one", TextSanitize.normalizeWhitespace("one"), "normalizeWhitespace 3");

        System.out.println("TextSanitizeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
