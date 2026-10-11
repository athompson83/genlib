// SPDX-License-Identifier: Apache-2.0

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Logic-less Mustache-subset templates: {{path}} (HTML-escaped), {{{path}}} (raw), {{#path}}..{{/path}} sections
 * (lists iterate, '.' is the item, lookups try the item then outer scopes; truthy maps push a scope),
 * {{^path}}..{{/path}} inverted sections and {{! comments }}. No partials, delimiters or lambdas. Data as in
 * JsonPatch (Map, List, String, numbers, Boolean, null). Values: null '', booleans 'true'/'false', integers in
 * decimal, integral doubles without '.0', other doubles via Double.toString (shortest round-trip, Java exponent
 * notation); lists or maps are an error. Every failure throws IllegalArgumentException.
 */
public final class TemplateRender {
    private static final Pattern NAME = Pattern.compile(
            "\\.|[A-Za-z_][A-Za-z0-9_-]*(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[(?:0|[1-9][0-9]*)\\])*");
    private static final Pattern TAG = Pattern.compile(
            "\\{\\{(\\{)?\\s*([#^/!]?)\\s*(.*?)\\s*(\\})?\\}\\}", Pattern.DOTALL | Pattern.UNICODE_CHARACTER_CLASS);
    private static final Pattern PART = Pattern.compile("[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]+\\]");

    private TemplateRender() {}

    private static final class Node {
        final String kind;
        final String text;
        final List<Node> children = new ArrayList<>();

        Node(String kind, String text) { this.kind = kind; this.text = text; }
    }

    /** Renders template with data, HTML-escaping {{path}} values. */
    public static String renderTemplate(String template, Object data) { return renderTemplate(template, data, true); }

    /** Renders template with data; escape=false leaves {{path}} values unescaped. */
    public static String renderTemplate(String template, Object data, boolean escape) {
        List<Object> stack = new ArrayList<>();
        stack.add(data);
        StringBuilder out = new StringBuilder();
        run(parse(template), stack, escape, out);
        return out.toString();
    }

    private static String esc(String s) {
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private static String str(Object v) {
        if (v == null) return "";
        if (v instanceof Boolean) return v.toString();
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (!Double.isInfinite(d) && d == Math.rint(d)) return new BigDecimal(d).toBigInteger().toString();
            return v instanceof Float ? Float.toString((Float) v) : Double.toString(d);
        }
        if (v instanceof Number) return v.toString();
        if (v instanceof String) return (String) v;
        throw new IllegalArgumentException("cannot render a list or object");
    }

    private static Object lookup(List<Object> stack, String path) {
        if (path.equals(".")) return stack.get(stack.size() - 1);
        List<String> parts = new ArrayList<>();
        Matcher m = PART.matcher(path);
        while (m.find()) parts.add(m.group());
        String first = parts.get(0);
        for (int s = stack.size() - 1; s >= 0; s--) {
            Object scope = stack.get(s);
            if (scope instanceof Map && ((Map<?, ?>) scope).containsKey(first)) {
                Object cur = ((Map<?, ?>) scope).get(first);
                for (String p : parts.subList(1, parts.size())) {
                    if (p.startsWith("[")) {
                        String digits = p.substring(1, p.length() - 1);
                        long i = digits.length() > 10 ? Long.MAX_VALUE : Long.parseLong(digits);
                        cur = cur instanceof List && i < ((List<?>) cur).size() ? ((List<?>) cur).get((int) i) : null;
                    } else {
                        cur = cur instanceof Map ? ((Map<?, ?>) cur).get(p) : null;
                    }
                    if (cur == null) return null;
                }
                return cur;
            }
        }
        return null;
    }

    private static List<Node> parse(String t) {
        int pos = 0;
        Node root = new Node("root", "");
        List<Node> stack = new ArrayList<>();
        stack.add(root);
        Matcher m = TAG.matcher(t);
        while (m.find()) {
            Node top = stack.get(stack.size() - 1);
            if (m.start() > pos) top.children.add(new Node("text", t.substring(pos, m.start())));
            boolean triple = m.group(1) != null;
            String sig = m.group(2);
            String name = m.group(3);
            boolean close = m.group(4) != null;
            if (sig.equals("!")) { pos = m.end(); continue; }
            if (triple != close || (triple && !sig.isEmpty())) throw new IllegalArgumentException("bad triple-brace tag");
            if (!NAME.matcher(name).matches()) throw new IllegalArgumentException("bad tag name '" + name + "'");
            if (sig.equals("#") || sig.equals("^")) {
                Node node = new Node(sig.equals("#") ? "section" : "inverted", name);
                top.children.add(node);
                stack.add(node);
            } else if (sig.equals("/")) {
                if (stack.size() == 1 || !top.text.equals(name)) throw new IllegalArgumentException("mismatched close tag");
                stack.remove(stack.size() - 1);
            } else {
                top.children.add(new Node(triple ? "raw" : "var", name));
            }
            pos = m.end();
        }
        String rest = t.substring(pos);
        if (rest.contains("{{")) throw new IllegalArgumentException("unclosed tag");
        if (!rest.isEmpty()) stack.get(stack.size() - 1).children.add(new Node("text", rest));
        if (stack.size() > 1) throw new IllegalArgumentException("unclosed section");
        return root.children;
    }

    private static boolean truthy(Object v) {
        if (v == null || Boolean.FALSE.equals(v)) return false;
        if (v instanceof Number) return ((Number) v).doubleValue() != 0;
        if (v instanceof String) return !((String) v).isEmpty();
        if (v instanceof List) return !((List<?>) v).isEmpty();
        if (v instanceof Map) return !((Map<?, ?>) v).isEmpty();
        return true;
    }

    private static void run(List<Node> nodes, List<Object> stack, boolean escape, StringBuilder out) {
        for (Node n : nodes) {
            switch (n.kind) {
                case "text":
                    out.append(n.text);
                    break;
                case "var":
                case "raw": {
                    String s = str(lookup(stack, n.text));
                    out.append(escape && n.kind.equals("var") ? esc(s) : s);
                    break;
                }
                case "section": {
                    Object v = lookup(stack, n.text);
                    if (v instanceof List) {
                        for (Object item : (List<?>) v) {
                            List<Object> inner = new ArrayList<>(stack);
                            inner.add(item);
                            run(n.children, inner, escape, out);
                        }
                    } else if (truthy(v)) {
                        List<Object> inner = new ArrayList<>(stack);
                        if (v instanceof Map) inner.add(v);
                        run(n.children, inner, escape, out);
                    }
                    break;
                }
                default: {
                    if (!truthy(lookup(stack, n.text))) run(n.children, stack, escape, out);
                }
            }
        }
    }
}
