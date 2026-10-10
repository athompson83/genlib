// SPDX-License-Identifier: Apache-2.0
import java.util.List;

public final class CsvSafeTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        List<List<String>> rows = List.of(List.of("id", "name", "note"), List.of("1", "Ada, Lovelace", "said \"hi\""),
            List.of("2", "=SUM(A1)", "line1\nline2"), List.of("3", " padded", "-5"));
        eq("id,name,note\r\n1,\"Ada, Lovelace\",\"said \"\"hi\"\"\"\r\n2,'=SUM(A1),\"line1\nline2\"\r\n3,\" padded\",'-5\r\n",
            CsvSafe.writeCsv(rows), "write vector csv");
        eq("=1\r\n", CsvSafe.writeCsv(List.of(List.of("=1")), false), "write without neutralization");
        eq("", CsvSafe.writeCsv(List.of()), "write empty rows");
        eq("'+1,'@x,'\tt\r\n", CsvSafe.writeCsv(List.of(List.of("+1", "@x", "\tt"))), "write neutralizes + @ TAB");
        eq("\"'\r\"\r\n", CsvSafe.writeCsv(List.of(List.of("\r"))), "write neutralizes and quotes CR");

        eq(List.of(List.of("a", "b"), List.of("x,1", "say \"hi\""), List.of("multi\nline", "")),
            CsvSafe.parseCsv("a,b\r\n\"x,1\",\"say \"\"hi\"\"\"\n\"multi\nline\",\n"), "parse vector");
        eq(List.of(List.of("a")), CsvSafe.parseCsv("﻿a\n"), "parse strips BOM");
        eq(List.of(), CsvSafe.parseCsv(""), "parse empty");
        eq(List.of(List.of("a", "")), CsvSafe.parseCsv("a,"), "parse trailing empty field without record end");
        throwsIae(() -> CsvSafe.parseCsv("a,\"b"), "parse unterminated quote");
        throwsIae(() -> CsvSafe.parseCsv("a\"b"), "parse quote in unquoted field");
        throwsIae(() -> CsvSafe.parseCsv("\"a\"x"), "parse text after closing quote");
        eq(rows, CsvSafe.parseCsv(CsvSafe.writeCsv(rows, false)), "round trip without neutralization");

        System.out.println("CsvSafeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
