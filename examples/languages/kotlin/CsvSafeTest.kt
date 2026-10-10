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
    val rows = listOf(listOf("id", "name", "note"), listOf("1", "Ada, Lovelace", "said \"hi\""),
        listOf("2", "=SUM(A1)", "line1\nline2"), listOf("3", " padded", "-5"))
    eq("id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n",
        CsvSafe.writeCsv(rows), "write vector csv")
    eq("=1\r\n", CsvSafe.writeCsv(listOf(listOf("=1")), neutralizeFormulas = false), "write without neutralization")
    eq("", CsvSafe.writeCsv(emptyList()), "write empty rows")
    eq("'+1,'@x,'\tt\r\n", CsvSafe.writeCsv(listOf(listOf("+1", "@x", "\tt"))), "write neutralizes + @ TAB")
    eq("\"'\r\"\r\n", CsvSafe.writeCsv(listOf(listOf("\r"))), "write neutralizes and quotes CR")

    eq(listOf(listOf("a", "b"), listOf("x,1", "say \"hi\""), listOf("multi\nline", "")),
        CsvSafe.parseCsv("a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n"), "parse vector")
    eq(listOf(listOf("a")), CsvSafe.parseCsv("﻿a\n"), "parse strips BOM")
    eq(emptyList<List<String>>(), CsvSafe.parseCsv(""), "parse empty")
    eq(listOf(listOf("a", "")), CsvSafe.parseCsv("a,"), "parse trailing empty field without record end")
    throwsIae("parse unterminated quote") { CsvSafe.parseCsv("a,\"b") }
    throwsIae("parse quote in unquoted field") { CsvSafe.parseCsv("a\"b") }
    throwsIae("parse text after closing quote") { CsvSafe.parseCsv("\"a\"x") }
    eq(rows, CsvSafe.parseCsv(CsvSafe.writeCsv(rows, false)), "round trip without neutralization")

    println("CsvSafeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
