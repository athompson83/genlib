// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class TemplateRenderTest {
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
        Object data = omapObj("name", "Ada <3", "html", "<b>x</b>", "n", 3L, "f", 2.5, "g", 4.0, "t", true, "z", 0L, "e", "", "items", lst(omapObj("name", "one"), omapObj("name", "two", "extra", "!")), "nums", lst(1L, 2L), "user", omapObj("first", "Grace", "tags", lst("x")), "empty", lst(), "obj", omapObj("k", "v"));
        eq("Hello Ada &lt;3!", TemplateRender.renderTemplate("Hello {{name}}!", data), "render 0");
        eq("<b>x</b> vs &lt;b&gt;x&lt;/b&gt;", TemplateRender.renderTemplate("{{{html}}} vs {{html}}", data), "render 1");
        eq("3 2.5 4 true 0 [] []", TemplateRender.renderTemplate("{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]", data), "render 2");
        eq("<one><two!>", TemplateRender.renderTemplate("{{#items}}<{{name}}{{extra}}>{{/items}}", data), "render 3");
        eq("1,2,", TemplateRender.renderTemplate("{{#nums}}{{.}},{{/nums}}", data), "render 4");
        eq("yeszeronone", TemplateRender.renderTemplate("{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}", data), "render 5");
        eq("Grace Ada &lt;3", TemplateRender.renderTemplate("{{#user}}{{first}} {{name}}{{/user}}", data), "render 6");
        eq("Grace x", TemplateRender.renderTemplate("{{user.first}} {{user.tags[0]}}", data), "render 7");
        eq("ab", TemplateRender.renderTemplate("a{{! comment }}b", data), "render 8");
        eq("v", TemplateRender.renderTemplate("{{#obj}}{{k}}{{/obj}}", data), "render 9");
        eq("[two]", TemplateRender.renderTemplate("{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}", data), "render 10");
        eq("no tags", TemplateRender.renderTemplate("no tags", data), "render 11");
        eq("<b>x</b>", TemplateRender.renderTemplate("{{html}}", data, false), "raw mode 0");
        throwsIae(() -> TemplateRender.renderTemplate("{{", data), "invalid 0");
        throwsIae(() -> TemplateRender.renderTemplate("{{#a}}x", data), "invalid 1");
        throwsIae(() -> TemplateRender.renderTemplate("{{#a}}x{{/b}}", data), "invalid 2");
        throwsIae(() -> TemplateRender.renderTemplate("{{/a}}", data), "invalid 3");
        throwsIae(() -> TemplateRender.renderTemplate("{{ bad name }}", data), "invalid 4");
        throwsIae(() -> TemplateRender.renderTemplate("{{{x}}", data), "invalid 5");
        throwsIae(() -> TemplateRender.renderTemplate("{{obj}}", data), "invalid 6");
        throwsIae(() -> TemplateRender.renderTemplate("{{items}}", data), "invalid 7");

        System.out.println("TemplateRenderTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
