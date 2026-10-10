// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun near(expected: Double, actual: Double, tol: Double, name: String) =
    check(Math.abs(expected - actual) <= tol, "$name expected <$expected> got <$actual>")

private fun nearAll(expected: DoubleArray, actual: DoubleArray, tol: Double, name: String) {
    check(expected.size == actual.size, "$name length")
    for (i in 0 until minOf(expected.size, actual.size)) near(expected[i], actual[i], tol, "$name[$i]")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    nearAll(doubleArrayOf(0.0, 0.0, 0.0, 1.0), ColorConvert.parseHex("#000"), 1e-6, "parseHex #000")
    val p0 = ColorConvert.parseHex("#000")
    eq("#000000", ColorConvert.toHex(p0[0], p0[1], p0[2], p0[3]), "round trip #000")
    nearAll(doubleArrayOf(1.0, 1.0, 1.0, 1.0), ColorConvert.parseHex("#fff"), 1e-6, "parseHex #fff")
    val p1 = ColorConvert.parseHex("#fff")
    eq("#ffffff", ColorConvert.toHex(p1[0], p1[1], p1[2], p1[3]), "round trip #fff")
    nearAll(doubleArrayOf(1.0, 0.0, 0.0, 1.0), ColorConvert.parseHex("#f00"), 1e-6, "parseHex #f00")
    val p2 = ColorConvert.parseHex("#f00")
    eq("#ff0000", ColorConvert.toHex(p2[0], p2[1], p2[2], p2[3]), "round trip #f00")
    nearAll(doubleArrayOf(0.0, 1.0, 0.5333333333333333, 1.0), ColorConvert.parseHex("#0f8"), 1e-6, "parseHex #0f8")
    val p3 = ColorConvert.parseHex("#0f8")
    eq("#00ff88", ColorConvert.toHex(p3[0], p3[1], p3[2], p3[3]), "round trip #0f8")
    nearAll(doubleArrayOf(0.2, 0.4, 0.6, 1.0), ColorConvert.parseHex("#336699"), 1e-6, "parseHex #336699")
    val p4 = ColorConvert.parseHex("#336699")
    eq("#336699", ColorConvert.toHex(p4[0], p4[1], p4[2], p4[3]), "round trip #336699")
    nearAll(doubleArrayOf(0.2, 0.4, 0.6, 0.8), ColorConvert.parseHex("#336699cc"), 1e-6, "parseHex #336699cc")
    val p5 = ColorConvert.parseHex("#336699cc")
    eq("#336699cc", ColorConvert.toHex(p5[0], p5[1], p5[2], p5[3]), "round trip #336699cc")
    nearAll(doubleArrayOf(0.6705882352941176, 0.803921568627451, 0.9372549019607843, 1.0), ColorConvert.parseHex("#ABCDEF"), 1e-6, "parseHex #ABCDEF")
    val p6 = ColorConvert.parseHex("#ABCDEF")
    eq("#abcdef", ColorConvert.toHex(p6[0], p6[1], p6[2], p6[3]), "round trip #ABCDEF")
    nearAll(doubleArrayOf(0.07058823529411765, 0.20392156862745098, 0.33725490196078434, 0.47058823529411764), ColorConvert.parseHex("#12345678"), 1e-6, "parseHex #12345678")
    val p7 = ColorConvert.parseHex("#12345678")
    eq("#12345678", ColorConvert.toHex(p7[0], p7[1], p7[2], p7[3]), "round trip #12345678")
    nearAll(doubleArrayOf(0.4980392156862745, 0.4980392156862745, 0.4980392156862745, 1.0), ColorConvert.parseHex("#7f7f7f"), 1e-6, "parseHex #7f7f7f")
    val p8 = ColorConvert.parseHex("#7f7f7f")
    eq("#7f7f7f", ColorConvert.toHex(p8[0], p8[1], p8[2], p8[3]), "round trip #7f7f7f")
    nearAll(doubleArrayOf(0.5019607843137255, 0.5019607843137255, 0.5019607843137255, 1.0), ColorConvert.parseHex("#808080"), 1e-6, "parseHex #808080")
    val p9 = ColorConvert.parseHex("#808080")
    eq("#808080", ColorConvert.toHex(p9[0], p9[1], p9[2], p9[3]), "round trip #808080")
    throwsIae("hex_invalid 336699") { ColorConvert.parseHex("336699") }
    throwsIae("hex_invalid #12") { ColorConvert.parseHex("#12") }
    throwsIae("hex_invalid #12345") { ColorConvert.parseHex("#12345") }
    throwsIae("hex_invalid #1234567") { ColorConvert.parseHex("#1234567") }
    throwsIae("hex_invalid #ggg") { ColorConvert.parseHex("#ggg") }
    throwsIae("hex_invalid #") { ColorConvert.parseHex("#") }
    throwsIae("hex_invalid rgb(1,2,3)") { ColorConvert.parseHex("rgb(1,2,3)") }
    throwsIae("hex_invalid #3366999") { ColorConvert.parseHex("#3366999") }
    eq("#808080", ColorConvert.toHex(0.5, 0.5, 0.5), "toHex 0")
    eq("#ff0080", ColorConvert.toHex(1.2, -0.1, 0.5), "toHex 1")
    eq("#00ff80", ColorConvert.toHex(0.001, 0.999, 0.5), "toHex 2")
    eq("#33669980", ColorConvert.toHex(0.2, 0.4, 0.6, 0.5), "toHex 3")
    eq("#336699", ColorConvert.toHex(0.2, 0.4, 0.6, 1.0), "toHex 4")
    eq("#010203", ColorConvert.toHex(0.00196078431372549, 0.0058823529411764705, 0.00980392156862745), "toHex 5")
    val q000 = ColorConvert.parseHex("#000")
    nearAll(doubleArrayOf(0.0, 0.0, 0.0), ColorConvert.rgbToHsl(q000[0], q000[1], q000[2]), 1e-6, "rgbToHsl #000")
    val qfff = ColorConvert.parseHex("#fff")
    nearAll(doubleArrayOf(0.0, 0.0, 1.0), ColorConvert.rgbToHsl(qfff[0], qfff[1], qfff[2]), 1e-6, "rgbToHsl #fff")
    val qf00 = ColorConvert.parseHex("#f00")
    nearAll(doubleArrayOf(0.0, 1.0, 0.5), ColorConvert.rgbToHsl(qf00[0], qf00[1], qf00[2]), 1e-6, "rgbToHsl #f00")
    val q0f0 = ColorConvert.parseHex("#0f0")
    nearAll(doubleArrayOf(120.0, 1.0, 0.5), ColorConvert.rgbToHsl(q0f0[0], q0f0[1], q0f0[2]), 1e-6, "rgbToHsl #0f0")
    val q00f = ColorConvert.parseHex("#00f")
    nearAll(doubleArrayOf(240.0, 1.0, 0.5), ColorConvert.rgbToHsl(q00f[0], q00f[1], q00f[2]), 1e-6, "rgbToHsl #00f")
    val q336699 = ColorConvert.parseHex("#336699")
    nearAll(doubleArrayOf(210.0, 0.49999999999999994, 0.4), ColorConvert.rgbToHsl(q336699[0], q336699[1], q336699[2]), 1e-6, "rgbToHsl #336699")
    val qff8000 = ColorConvert.parseHex("#ff8000")
    nearAll(doubleArrayOf(30.11764705882353, 1.0, 0.5), ColorConvert.rgbToHsl(qff8000[0], qff8000[1], qff8000[2]), 1e-6, "rgbToHsl #ff8000")
    val q808080 = ColorConvert.parseHex("#808080")
    nearAll(doubleArrayOf(0.0, 0.0, 0.5019607843137255), ColorConvert.rgbToHsl(q808080[0], q808080[1], q808080[2]), 1e-6, "rgbToHsl #808080")
    val qc0ffee = ColorConvert.parseHex("#c0ffee")
    nearAll(doubleArrayOf(163.80952380952382, 1.0, 0.8764705882352941), ColorConvert.rgbToHsl(qc0ffee[0], qc0ffee[1], qc0ffee[2]), 1e-6, "rgbToHsl #c0ffee")
    nearAll(doubleArrayOf(1.0, 0.0, 0.0), ColorConvert.hslToRgb(0.0, 1.0, 0.5), 1e-6, "hslToRgb 0")
    nearAll(doubleArrayOf(0.0, 1.0, 0.0), ColorConvert.hslToRgb(120.0, 1.0, 0.5), 1e-6, "hslToRgb 1")
    nearAll(doubleArrayOf(0.0, 0.0, 1.0), ColorConvert.hslToRgb(240.0, 1.0, 0.5), 1e-6, "hslToRgb 2")
    nearAll(doubleArrayOf(0.2, 0.4, 0.6000000000000001), ColorConvert.hslToRgb(210.0, 0.5, 0.4), 1e-6, "hslToRgb 3")
    nearAll(doubleArrayOf(1.0, 0.0, 0.0), ColorConvert.hslToRgb(360.0, 1.0, 0.5), 1e-6, "hslToRgb 4")
    nearAll(doubleArrayOf(1.0, 0.0, 0.5), ColorConvert.hslToRgb(-30.0, 1.0, 0.5), 1e-6, "hslToRgb 5")
    nearAll(doubleArrayOf(0.3, 0.3, 0.3), ColorConvert.hslToRgb(90.0, 0.0, 0.3), 1e-6, "hslToRgb 6")
    nearAll(doubleArrayOf(1.0, 0.75, 0.5), ColorConvert.hslToRgb(30.0, 1.0, 0.75), 1e-6, "hslToRgb 7")
    val o000 = ColorConvert.parseHex("#000")
    nearAll(doubleArrayOf(0.0, 0.0, 0.0), ColorConvert.rgbToOklch(o000[0], o000[1], o000[2]), 1e-6, "rgbToOklch #000")
    val offf = ColorConvert.parseHex("#fff")
    nearAll(doubleArrayOf(0.9999999934735462, 3.727399553519285e-08, 0.0), ColorConvert.rgbToOklch(offf[0], offf[1], offf[2]), 1e-6, "rgbToOklch #fff")
    val of00 = ColorConvert.parseHex("#f00")
    nearAll(doubleArrayOf(0.6279553606145516, 0.2576833077361567, 29.233885192342633), ColorConvert.rgbToOklch(of00[0], of00[1], of00[2]), 1e-6, "rgbToOklch #f00")
    val o0f0 = ColorConvert.parseHex("#0f0")
    nearAll(doubleArrayOf(0.8664396115356694, 0.2948272403370166, 142.49533888780996), ColorConvert.rgbToOklch(o0f0[0], o0f0[1], o0f0[2]), 1e-6, "rgbToOklch #0f0")
    val o00f = ColorConvert.parseHex("#00f")
    nearAll(doubleArrayOf(0.4520137183853429, 0.31321437166460114, 264.052020638055), ColorConvert.rgbToOklch(o00f[0], o00f[1], o00f[2]), 1e-6, "rgbToOklch #00f")
    val o336699 = ColorConvert.parseHex("#336699")
    nearAll(doubleArrayOf(0.49931445292373877, 0.09866435965710138, 250.43305370947127), ColorConvert.rgbToOklch(o336699[0], o336699[1], o336699[2]), 1e-6, "rgbToOklch #336699")
    val o808080 = ColorConvert.parseHex("#808080")
    nearAll(doubleArrayOf(0.5998708017071177, 2.2359581629199253e-08, 0.0), ColorConvert.rgbToOklch(o808080[0], o808080[1], o808080[2]), 1e-6, "rgbToOklch #808080")
    val off8000 = ColorConvert.parseHex("#ff8000")
    nearAll(doubleArrayOf(0.7318948427227374, 0.1858032156306402, 52.984679593971286), ColorConvert.rgbToOklch(off8000[0], off8000[1], off8000[2]), 1e-6, "rgbToOklch #ff8000")
    nearAll(doubleArrayOf(0.9999989995226538, 2.4989239385060646e-06, -3.5938127559420605e-08), ColorConvert.oklchToRgb(0.627955, 0.257683, 29.2339), 1e-6, "oklchToRgb 0")
    nearAll(doubleArrayOf(0.25183094033414793, 0.6942495954401551, 0.7170636897415913), ColorConvert.oklchToRgb(0.7, 0.1, 200.0), 1e-6, "oklchToRgb 1")
    nearAll(doubleArrayOf(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896), ColorConvert.oklchToRgb(0.5, 0.4, 150.0), 1e-6, "oklchToRgb 2")
    nearAll(doubleArrayOf(0.9999999999999999, 0.9999999999999999, 0.9999999999999999), ColorConvert.oklchToRgb(1.0, 0.0, 0.0), 1e-6, "oklchToRgb 3")
    nearAll(doubleArrayOf(0.0, 0.0, 0.0), ColorConvert.oklchToRgb(0.0, 0.0, 0.0), 1e-6, "oklchToRgb 4")
    eq(true, ColorConvert.inGamut(0.25183094033414793, 0.6942495954401551, 0.7170636897415913), "inGamut 0")
    eq(false, ColorConvert.inGamut(-2.5595884674002214, 0.5687880047974224, -0.8622713129274896), "inGamut 1")

    println("ColorConvertTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
