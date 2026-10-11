// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class ShellQuoteTest {
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
        eq("''", ShellQuote.shellQuote(""), "quote 0");
        eq("abc", ShellQuote.shellQuote("abc"), "quote 1");
        eq("'a b'", ShellQuote.shellQuote("a b"), "quote 2");
        eq("'it'\\''s'", ShellQuote.shellQuote("it's"), "quote 3");
        eq("'a\"b'", ShellQuote.shellQuote("a\"b"), "quote 4");
        eq("'$HOME'", ShellQuote.shellQuote("$HOME"), "quote 5");
        eq("'*.txt'", ShellQuote.shellQuote("*.txt"), "quote 6");
        eq("x=1", ShellQuote.shellQuote("x=1"), "quote 7");
        eq("path/to/file.txt", ShellQuote.shellQuote("path/to/file.txt"), "quote 8");
        eq("'tab\there'", ShellQuote.shellQuote("tab\there"), "quote 9");
        eq("'line\nbreak'", ShellQuote.shellQuote("line\nbreak"), "quote 10");
        eq("'\u00e9'", ShellQuote.shellQuote("\u00e9"), "quote 11");
        eq("-n", ShellQuote.shellQuote("-n"), "quote 12");
        eq("'~user'", ShellQuote.shellQuote("~user"), "quote 13");
        eq("'!bang'", ShellQuote.shellQuote("!bang"), "quote 14");
        eq("''\\'''\\'''", ShellQuote.shellQuote("''"), "quote 15");
        eq("ls -la 'my file' 'it'\\''s'", ShellQuote.shellJoin(List.of("ls", "-la", "my file", "it's")), "join 0");
        eq("", ShellQuote.shellJoin(List.of()), "join 1");
        eq(List.of("a", "b", "c"), ShellQuote.shellSplit("a b  c"), "split 0");
        eq(List.of("a b", "c"), ShellQuote.shellSplit("'a b' c"), "split 1");
        eq(List.of("a b", "c"), ShellQuote.shellSplit("\"a b\" c"), "split 2");
        eq(List.of("a b"), ShellQuote.shellSplit("a\\ b"), "split 3");
        eq(List.of("say \"hi\""), ShellQuote.shellSplit("\"say \\\"hi\\\"\""), "split 4");
        eq(List.of("keep \\n and \\x"), ShellQuote.shellSplit("\"keep \\n and \\x\""), "split 5");
        eq(List.of("no \\escape"), ShellQuote.shellSplit("'no \\escape'"), "split 6");
        eq(List.of("xyzw"), ShellQuote.shellSplit("x\"y\"'z'w"), "split 7");
        eq(List.of("", ""), ShellQuote.shellSplit("'' \"\""), "split 8");
        eq(List.of("a", "b", "c"), ShellQuote.shellSplit("a\tb\nc"), "split 9");
        eq(List.of("echo", "$HOME", "*.txt", "~"), ShellQuote.shellSplit("echo $HOME *.txt ~"), "split 10");
        eq(List.of("ab"), ShellQuote.shellSplit("\"a\\\nb\""), "split 11");
        eq(List.of("ab"), ShellQuote.shellSplit("a\\\nb"), "split 12");
        eq(List.of(), ShellQuote.shellSplit("# comment"), "split 13");
        eq(List.of("cmd"), ShellQuote.shellSplit("cmd # trailing comment"), "split 14");
        eq(List.of("a#b"), ShellQuote.shellSplit("a#b"), "split 15");
        eq(List.of("$x"), ShellQuote.shellSplit("\"$x\""), "split 16");
        eq(List.of("lead", "trail"), ShellQuote.shellSplit("  lead  trail  "), "split 17");
        eq(List.of(""), ShellQuote.shellSplit(ShellQuote.shellQuote("")), "roundtrip 0");
        eq(List.of("abc"), ShellQuote.shellSplit(ShellQuote.shellQuote("abc")), "roundtrip 1");
        eq(List.of("a b"), ShellQuote.shellSplit(ShellQuote.shellQuote("a b")), "roundtrip 2");
        eq(List.of("it's"), ShellQuote.shellSplit(ShellQuote.shellQuote("it's")), "roundtrip 3");
        eq(List.of("a\"b"), ShellQuote.shellSplit(ShellQuote.shellQuote("a\"b")), "roundtrip 4");
        eq(List.of("$HOME"), ShellQuote.shellSplit(ShellQuote.shellQuote("$HOME")), "roundtrip 5");
        eq(List.of("*.txt"), ShellQuote.shellSplit(ShellQuote.shellQuote("*.txt")), "roundtrip 6");
        eq(List.of("x=1"), ShellQuote.shellSplit(ShellQuote.shellQuote("x=1")), "roundtrip 7");
        eq(List.of("path/to/file.txt"), ShellQuote.shellSplit(ShellQuote.shellQuote("path/to/file.txt")), "roundtrip 8");
        eq(List.of("tab\there"), ShellQuote.shellSplit(ShellQuote.shellQuote("tab\there")), "roundtrip 9");
        eq(List.of("line\nbreak"), ShellQuote.shellSplit(ShellQuote.shellQuote("line\nbreak")), "roundtrip 10");
        eq(List.of("\u00e9"), ShellQuote.shellSplit(ShellQuote.shellQuote("\u00e9")), "roundtrip 11");
        eq(List.of("-n"), ShellQuote.shellSplit(ShellQuote.shellQuote("-n")), "roundtrip 12");
        eq(List.of("~user"), ShellQuote.shellSplit(ShellQuote.shellQuote("~user")), "roundtrip 13");
        eq(List.of("!bang"), ShellQuote.shellSplit(ShellQuote.shellQuote("!bang")), "roundtrip 14");
        eq(List.of("''"), ShellQuote.shellSplit(ShellQuote.shellQuote("''")), "roundtrip 15");
        eq(List.of("", "abc", "a b", "it's", "a\"b", "$HOME", "*.txt", "x=1", "path/to/file.txt", "tab\there", "line\nbreak", "\u00e9", "-n", "~user", "!bang", "''"), ShellQuote.shellSplit(ShellQuote.shellJoin(List.of("", "abc", "a b", "it's", "a\"b", "$HOME", "*.txt", "x=1", "path/to/file.txt", "tab\there", "line\nbreak", "\u00e9", "-n", "~user", "!bang", "''"))), "join roundtrip");
        throwsIae(() -> ShellQuote.shellSplit("'open"), "invalid split 0");
        throwsIae(() -> ShellQuote.shellSplit("\"open"), "invalid split 1");
        throwsIae(() -> ShellQuote.shellSplit("trail\\"), "invalid split 2");
        throwsIae(() -> ShellQuote.shellSplit("\"bad \\"), "invalid split 3");

        System.out.println("ShellQuoteTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
