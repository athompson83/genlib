// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(21.0, WcagContrast.contrastRatio2("#000", "#fff"), "bw")
    eq(4.54, WcagContrast.contrastRatio2("#767676", "#ffffff"), "grey")
    eq(4.51, WcagContrast.contrastRatio2("#1a73e8", "#ffffff"), "blue")
    eq(1.0, WcagContrast.contrastRatio2("#abc", "#aabbcc"), "same")
    eq(1.07, WcagContrast.contrastRatio2("#ffff00", "#ffffff"), "yellow")
    eq(4.54, WcagContrast.contrastRatio2("#FFFFFF", "#767676"), "order and case independent")
    val grey = WcagContrast.contrastRatio("#767676", "#ffffff")
    check(WcagContrast.passes(grey, "AA", false), "grey passes AA normal")
    check(!WcagContrast.passes(grey, "AAA", false), "grey fails AAA normal")
    check(WcagContrast.passes(grey, "AAA", true), "grey passes AAA large")
    check(!WcagContrast.passes(WcagContrast.contrastRatio("#ffff00", "#ffffff"), "AA", true), "yellow fails AA large")
    check(WcagContrast.passes(21.0, "AAA", false), "black on white passes AAA")
    check(!WcagContrast.passes(4.4999, "AA", false), "unrounded ratio compared")
    eq(0.0, WcagContrast.relativeLuminance("#000000"), "black luminance")
    eq(1.0, WcagContrast.relativeLuminance("#FFF"), "white luminance")
    for (bad in listOf("fff", "#ff", "#ffff", "#gggggg", "#12345", "", "#１１１")) {
        throwsIae("rejects '$bad'") { WcagContrast.relativeLuminance(bad) }
    }
    throwsIae("rejects level A") { WcagContrast.passes(5.0, "A", false) }

    println("WcagContrastTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
