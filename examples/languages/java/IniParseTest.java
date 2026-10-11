// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class IniParseTest {
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

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static LinkedHashMap<String, String> omap(String... kv) {
        LinkedHashMap<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static LinkedHashMap<String, Object> omapObj(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static LinkedHashMap<String, LinkedHashMap<String, String>> iniData(Object... kv) {
        LinkedHashMap<String, LinkedHashMap<String, String>> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (LinkedHashMap<String, String>) kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    private static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xFF));
        return sb.toString();
    }

    /** Deterministic test byte source that cycles through the given bytes (passgen_ref.byte_source). */
    private static IntSupplier bytes(String h) {
        byte[] b = hex(h);
        int[] i = {0};
        return () -> b[i[0]++ % b.length] & 0xFF;
    }

    public static void main(String[] args) {
        eqOrd(omapObj("", omapObj("a", "1", "b", "two")), IniParse.parseIni("a=1\nb = two\n"), "parse 0");
        eqOrd(omapObj("", omapObj(), "db", omapObj("host", "localhost", "port", "5432")), IniParse.parseIni("[db]\nhost = localhost ; comment\nport: 5432\n"), "parse 1");
        eqOrd(omapObj("", omapObj(), "s", omapObj("k", "quoted \"x\" \\ ;#")), IniParse.parseIni("; c\n# c\n\n[s]\nk=\"quoted \\\"x\\\" \\\\ ;#\"\n"), "parse 2");
        eqOrd(omapObj("", omapObj(), "s", omapObj("flag", "", "x", "a#b", "y", "a")), IniParse.parseIni("[s]\nflag\nx = a#b\ny = a #b\n"), "parse 3");
        eqOrd(omapObj("", omapObj(), "a", omapObj("k", "3", "j", "4"), "b", omapObj("k", "2")), IniParse.parseIni("[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n"), "parse 4");
        eqOrd(omapObj("", omapObj("k", "v = w")), IniParse.parseIni("k: v = w\n"), "parse 5");
        eqOrd(omapObj("", omapObj(), "spaced name", omapObj("K", "V", "k2", "v2")), IniParse.parseIni("[ spaced name ]\nK=V\r\nk2=v2\r\n"), "parse 6");
        eqOrd(omapObj("", omapObj()), IniParse.parseIni(""), "parse 7");
        eq("a = 1\n\n[s]\nk = v\ne = \"\"\nsp = \" x\"\nq = \"a\\\"b;c\"\n", IniParse.stringifyIni(iniData("", omap("a", "1"), "s", omap("k", "v", "e", "", "sp", " x", "q", "a\"b;c"))), "stringify 0");
        eqOrd(iniData("", omap("a", "1"), "s", omap("k", "v", "e", "", "sp", " x", "q", "a\"b;c")), IniParse.parseIni(IniParse.stringifyIni(iniData("", omap("a", "1"), "s", omap("k", "v", "e", "", "sp", " x", "q", "a\"b;c")))), "stringify round trip 0");
        eq("[only]\nx = y\n", IniParse.stringifyIni(iniData("", omap(), "only", omap("x", "y"))), "stringify 1");
        eqOrd(iniData("", omap(), "only", omap("x", "y")), IniParse.parseIni(IniParse.stringifyIni(iniData("", omap(), "only", omap("x", "y")))), "stringify round trip 1");
        eq("", IniParse.stringifyIni(iniData("", omap())), "stringify 2");
        eqOrd(iniData("", omap()), IniParse.parseIni(IniParse.stringifyIni(iniData("", omap()))), "stringify round trip 2");
        throwsMsg(() -> IniParse.parseIni("[unterminated\n"), "line ", "invalid 0");
        throwsMsg(() -> IniParse.parseIni("[]\n"), "line ", "invalid 1");
        throwsMsg(() -> IniParse.parseIni("=v\n"), "line ", "invalid 2");
        throwsMsg(() -> IniParse.parseIni("k=\"open\n"), "line ", "invalid 3");
        throwsMsg(() -> IniParse.parseIni("[a]]\n"), "line ", "invalid 4");

        System.out.println("IniParseTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
