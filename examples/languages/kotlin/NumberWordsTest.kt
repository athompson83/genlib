// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.
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

/** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
private fun near(expected: Double, actual: Double, name: String) =
    check(Math.abs(expected - actual) <= maxOf(1e-9 * maxOf(Math.abs(expected), Math.abs(actual)), 1e-12), "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun omap(vararg kv: Pair<String, Any?>): LinkedHashMap<String, Any?> = linkedMapOf(*kv)

private fun lst(vararg xs: Any?): ArrayList<Any?> = arrayListOf(*xs)

fun main() {
    eq("zero", NumberWords.numberToWords(0L), "words 0")
    eq("one", NumberWords.numberToWords(1L), "words 1")
    eq("seven", NumberWords.numberToWords(7L), "words 2")
    eq("ten", NumberWords.numberToWords(10L), "words 3")
    eq("eleven", NumberWords.numberToWords(11L), "words 4")
    eq("thirteen", NumberWords.numberToWords(13L), "words 5")
    eq("nineteen", NumberWords.numberToWords(19L), "words 6")
    eq("twenty", NumberWords.numberToWords(20L), "words 7")
    eq("twenty-one", NumberWords.numberToWords(21L), "words 8")
    eq("forty-two", NumberWords.numberToWords(42L), "words 9")
    eq("ninety-nine", NumberWords.numberToWords(99L), "words 10")
    eq("one hundred", NumberWords.numberToWords(100L), "words 11")
    eq("one hundred one", NumberWords.numberToWords(101L), "words 12")
    eq("one hundred ten", NumberWords.numberToWords(110L), "words 13")
    eq("one hundred fifteen", NumberWords.numberToWords(115L), "words 14")
    eq("nine hundred ninety-nine", NumberWords.numberToWords(999L), "words 15")
    eq("one thousand", NumberWords.numberToWords(1000L), "words 16")
    eq("one thousand one", NumberWords.numberToWords(1001L), "words 17")
    eq("one thousand ten", NumberWords.numberToWords(1010L), "words 18")
    eq("one thousand one hundred", NumberWords.numberToWords(1100L), "words 19")
    eq("two thousand twenty-four", NumberWords.numberToWords(2024L), "words 20")
    eq("twelve thousand three hundred forty-five", NumberWords.numberToWords(12345L), "words 21")
    eq("one hundred thousand", NumberWords.numberToWords(100000L), "words 22")
    eq("nine hundred ninety-nine thousand nine hundred ninety-nine", NumberWords.numberToWords(999999L), "words 23")
    eq("one million", NumberWords.numberToWords(1000000L), "words 24")
    eq("one million one", NumberWords.numberToWords(1000001L), "words 25")
    eq("one million two hundred thirty-four thousand five hundred sixty-seven", NumberWords.numberToWords(1234567L), "words 26")
    eq("one billion", NumberWords.numberToWords(1000000000L), "words 27")
    eq("one billion two million three thousand four", NumberWords.numberToWords(1002003004L), "words 28")
    eq("nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine", NumberWords.numberToWords(999999999999999L), "words 29")
    eq("negative one", NumberWords.numberToWords(-1L), "words 30")
    eq("negative forty-two", NumberWords.numberToWords(-42L), "words 31")
    eq("negative one million", NumberWords.numberToWords(-1000000L), "words 32")
    eq("zeroth", NumberWords.ordinalWords(0L), "ordinal words 0")
    eq("first", NumberWords.ordinalWords(1L), "ordinal words 1")
    eq("second", NumberWords.ordinalWords(2L), "ordinal words 2")
    eq("third", NumberWords.ordinalWords(3L), "ordinal words 3")
    eq("fourth", NumberWords.ordinalWords(4L), "ordinal words 4")
    eq("fifth", NumberWords.ordinalWords(5L), "ordinal words 5")
    eq("eighth", NumberWords.ordinalWords(8L), "ordinal words 6")
    eq("ninth", NumberWords.ordinalWords(9L), "ordinal words 7")
    eq("eleventh", NumberWords.ordinalWords(11L), "ordinal words 8")
    eq("twelfth", NumberWords.ordinalWords(12L), "ordinal words 9")
    eq("twentieth", NumberWords.ordinalWords(20L), "ordinal words 10")
    eq("twenty-first", NumberWords.ordinalWords(21L), "ordinal words 11")
    eq("twenty-second", NumberWords.ordinalWords(22L), "ordinal words 12")
    eq("twenty-third", NumberWords.ordinalWords(23L), "ordinal words 13")
    eq("thirtieth", NumberWords.ordinalWords(30L), "ordinal words 14")
    eq("fortieth", NumberWords.ordinalWords(40L), "ordinal words 15")
    eq("ninety-ninth", NumberWords.ordinalWords(99L), "ordinal words 16")
    eq("one hundredth", NumberWords.ordinalWords(100L), "ordinal words 17")
    eq("one hundred first", NumberWords.ordinalWords(101L), "ordinal words 18")
    eq("one hundred second", NumberWords.ordinalWords(102L), "ordinal words 19")
    eq("one hundred eleventh", NumberWords.ordinalWords(111L), "ordinal words 20")
    eq("one hundred twelfth", NumberWords.ordinalWords(112L), "ordinal words 21")
    eq("one thousandth", NumberWords.ordinalWords(1000L), "ordinal words 22")
    eq("one thousand first", NumberWords.ordinalWords(1001L), "ordinal words 23")
    eq("one millionth", NumberWords.ordinalWords(1000000L), "ordinal words 24")
    eq("two thousand twenty-third", NumberWords.ordinalWords(2023L), "ordinal words 25")
    eq("0th", NumberWords.ordinalSuffix(0L), "ordinal suffix 0")
    eq("1st", NumberWords.ordinalSuffix(1L), "ordinal suffix 1")
    eq("2nd", NumberWords.ordinalSuffix(2L), "ordinal suffix 2")
    eq("3rd", NumberWords.ordinalSuffix(3L), "ordinal suffix 3")
    eq("4th", NumberWords.ordinalSuffix(4L), "ordinal suffix 4")
    eq("11th", NumberWords.ordinalSuffix(11L), "ordinal suffix 5")
    eq("12th", NumberWords.ordinalSuffix(12L), "ordinal suffix 6")
    eq("13th", NumberWords.ordinalSuffix(13L), "ordinal suffix 7")
    eq("14th", NumberWords.ordinalSuffix(14L), "ordinal suffix 8")
    eq("21st", NumberWords.ordinalSuffix(21L), "ordinal suffix 9")
    eq("22nd", NumberWords.ordinalSuffix(22L), "ordinal suffix 10")
    eq("23rd", NumberWords.ordinalSuffix(23L), "ordinal suffix 11")
    eq("101st", NumberWords.ordinalSuffix(101L), "ordinal suffix 12")
    eq("111th", NumberWords.ordinalSuffix(111L), "ordinal suffix 13")
    eq("112th", NumberWords.ordinalSuffix(112L), "ordinal suffix 14")
    eq("113th", NumberWords.ordinalSuffix(113L), "ordinal suffix 15")
    eq("1001st", NumberWords.ordinalSuffix(1001L), "ordinal suffix 16")
    eq("-1st", NumberWords.ordinalSuffix(-1L), "ordinal suffix 17")
    eq("-11th", NumberWords.ordinalSuffix(-11L), "ordinal suffix 18")
    eq("-22nd", NumberWords.ordinalSuffix(-22L), "ordinal suffix 19")
    eq("one hundred twenty-three dollars and forty-five cents", NumberWords.moneyWords(12345L, "dollar", "cent", 2), "money 0")
    eq("one dollar", NumberWords.moneyWords(100L, "dollar", "cent", 2), "money 1")
    eq("zero dollars and one cent", NumberWords.moneyWords(1L, "dollar", "cent", 2), "money 2")
    eq("one euro and one cent", NumberWords.moneyWords(101L, "euro", "cent", 2), "money 3")
    eq("zero dollars", NumberWords.moneyWords(0L, "dollar", "cent", 2), "money 4")
    eq("five hundred yens", NumberWords.moneyWords(500L, "yen", "sen", 0), "money 5")
    eq("one dinar and one fils", NumberWords.moneyWords(1001L, "dinar", "fils", 3), "money 6")
    eq("one pound and ninety-nine pennys", NumberWords.moneyWords(199L, "pound", "penny", 2), "money 7")
    throwsIae("invalid words 0") { NumberWords.numberToWords(1000000000000000L) }
    throwsIae("invalid words 1") { NumberWords.numberToWords(-1000000000000000L) }
    throwsIae("invalid ordinal 0") { NumberWords.ordinalWords(-1L) }
    throwsIae("invalid money amount") { NumberWords.moneyWords(-1L, "dollar", "cent", 2) }
    throwsIae("invalid money exponent") { NumberWords.moneyWords(1L, "dollar", "cent", 4) }

    println("NumberWordsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
