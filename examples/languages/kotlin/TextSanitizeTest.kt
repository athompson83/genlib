// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for text-sanitize.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq("plain text", TextSanitize.sanitizeText("plain text"), "sanitize 0")
    eq("line1\nline2\nline3", TextSanitize.sanitizeText("line1\r\nline2\rline3"), "sanitize 1")
    eq("zerowidthbom", TextSanitize.sanitizeText("zero\u200Bwidth\uFEFFbom"), "sanitize 2")
    eq("tab\therenuldelnel", TextSanitize.sanitizeText("tab\there\u0000nul\u007Fdel\u0085nel"), "sanitize 3")
    eq("if (accessLevel != \"user // Check if admin \") {", TextSanitize.sanitizeText("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {"), "sanitize 4")
    eq("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family", TextSanitize.sanitizeText("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"), "sanitize 5")
    eq("caf\u00E9 e\u0301", TextSanitize.sanitizeText("caf\u00E9 e\u0301"), "sanitize 6")
    eq("a b c", TextSanitize.sanitizeText("a\nb\r\nc", allowNewlines = false), "sanitize 7")
    eq("abc", TextSanitize.sanitizeText("abcdef", maxLength = 3), "sanitize 8")
    eq("\uD83D\uDE00\uD83D\uDE00", TextSanitize.sanitizeText("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", maxLength = 2), "sanitize 9")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("plain text"), "findBidi 0")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("line1\r\nline2\rline3"), "findBidi 1")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("zero\u200Bwidth\uFEFFbom"), "findBidi 2")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("tab\there\u0000nul\u007Fdel\u0085nel"), "findBidi 3")
    eq(listOf<TextSanitize.BidiControl>(TextSanitize.BidiControl(24, "202E"), TextSanitize.BidiControl(26, "2066"), TextSanitize.BidiControl(44, "2069"), TextSanitize.BidiControl(46, "2066")), TextSanitize.findBidiControls("if (accessLevel != \"user\u202E \u2066// Check if admin\u2069 \u2066\") {"), "findBidi 4")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("emoji \uD83D\uDC4D\uD83C\uDFFD and ZWJ \uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67 family"), "findBidi 5")
    eq(listOf<TextSanitize.BidiControl>(), TextSanitize.findBidiControls("caf\u00E9 e\u0301"), "findBidi 6")
    eq("a b c d", TextSanitize.normalizeWhitespace("  a   b\t\tc\n\nd  "), "normalizeWhitespace 0")
    eq("", TextSanitize.normalizeWhitespace(""), "normalizeWhitespace 1")
    eq("", TextSanitize.normalizeWhitespace(" \t\n "), "normalizeWhitespace 2")
    eq("one", TextSanitize.normalizeWhitespace("one"), "normalizeWhitespace 3")

    println("TextSanitizeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
