// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

/** Equality plus identical toString, so map entry order is checked too. */
private fun eqOrd(expected: Any?, actual: Any?, name: String) {
    eq(expected, actual, name)
    eq(expected.toString(), actual.toString(), "$name (order)")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

fun main() {
    eq("attachment; filename=\"report.pdf\"", ContentDisposition.buildContentDisposition("report.pdf", false), "build 0")
    eq("attachment; filename=\"caf_.pdf\"; filename*=UTF-8''caf%C3%A9.pdf", ContentDisposition.buildContentDisposition("caf\u00E9.pdf", false), "build 1")
    eq("attachment; filename=\"_etc_passwd\"", ContentDisposition.buildContentDisposition("../etc/passwd", false), "build 2")
    eq("attachment; filename=\"a_b_c.txt\"", ContentDisposition.buildContentDisposition("a\"b\\c.txt", false), "build 3")
    eq("attachment; filename=\"hidden\"", ContentDisposition.buildContentDisposition("  .hidden  ", false), "build 4")
    eq("attachment; filename=\"download\"", ContentDisposition.buildContentDisposition("", false), "build 5")
    eq("inline; filename=\"___.txt\"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt", ContentDisposition.buildContentDisposition("\u65E5\u672C\u8A9E.txt", true), "build 6")
    eq("attachment; filename=\"tab_here.csv\"", ContentDisposition.buildContentDisposition("tab\there.csv", false), "build 7")
    eq("attachment; filename=\"100% sure+ok.txt\"", ContentDisposition.buildContentDisposition("100% sure+ok.txt", false), "build 8")
    eqOrd(ContentDisposition.Disposition("attachment", "x.txt", linkedMapOf<String, String>("filename" to "x.txt")), ContentDisposition.parseContentDisposition("attachment; filename=\"x.txt\""), "parse 0")
    eqOrd(ContentDisposition.Disposition("attachment", "x.txt", linkedMapOf<String, String>("filename" to "x.txt")), ContentDisposition.parseContentDisposition("attachment; filename=x.txt"), "parse 1")
    eqOrd(ContentDisposition.Disposition("inline", null, linkedMapOf<String, String>()), ContentDisposition.parseContentDisposition("INLINE"), "parse 2")
    eqOrd(ContentDisposition.Disposition("attachment", "\u20AC rates.txt", linkedMapOf<String, String>("filename" to "\u20AC rates.txt")), ContentDisposition.parseContentDisposition("attachment; filename=\"a.txt\"; filename*=UTF-8''%E2%82%AC%20rates.txt"), "parse 3")
    eqOrd(ContentDisposition.Disposition("attachment", "\u00A3 rates.txt", linkedMapOf<String, String>("filename" to "\u00A3 rates.txt")), ContentDisposition.parseContentDisposition("attachment; filename*=iso-8859-1'en'%A3%20rates.txt"), "parse 4")
    eqOrd(ContentDisposition.Disposition("attachment", "_.._evil.exe", linkedMapOf<String, String>("filename" to "..\\..\\evil.exe")), ContentDisposition.parseContentDisposition("attachment; filename=\"..\\\\..\\\\evil.exe\""), "parse 5")
    eqOrd(ContentDisposition.Disposition("attachment", "_quoted_.txt", linkedMapOf<String, String>("filename" to "\"quoted\".txt", "size" to "100")), ContentDisposition.parseContentDisposition("attachment; filename=\"\\\"quoted\\\".txt\"; size=100"), "parse 6")
    eqOrd(ContentDisposition.Disposition("form-data", "photo.jpg", linkedMapOf<String, String>("name" to "file", "filename" to "photo.jpg")), ContentDisposition.parseContentDisposition("form-data; name=\"file\"; filename=\"photo.jpg\""), "parse 7")
    throwsIae("invalid 0") { ContentDisposition.parseContentDisposition("; filename=x") }
    throwsIae("invalid 1") { ContentDisposition.parseContentDisposition("attachment; filename=\"open") }
    throwsIae("invalid 2") { ContentDisposition.parseContentDisposition("attachment; filename*=UTF-8''%G0") }
    throwsIae("invalid 3") { ContentDisposition.parseContentDisposition("attachment filename=x") }
    eq("download", ContentDisposition.sanitizeFilename(" .. "), "sanitize empty")
    eq("attachment; filename=\"_.txt\"; filename*=UTF-8''%F0%9F%98%80.txt", ContentDisposition.buildContentDisposition("\uD83D\uDE00.txt"), "astral code point is one fallback char")

    println("ContentDispositionTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
