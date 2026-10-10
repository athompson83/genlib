// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * RFC 8259 JSON parse/canonical form, RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 merge patch
 * and a deterministic patch generator. Values: LinkedHashMap&lt;String, Object&gt; (any Map with String
 * keys is accepted), ArrayList (any List), String, Long or Double (integers that fit a long parse as
 * Long, other numbers as Double; Integer, Short, Byte, BigInteger and Float are accepted), Boolean and
 * null for JSON null. Numbers compare numerically (1 equals 1.0); non-integer doubles print in Java's
 * shortest round-trip form (Double.toString). Every failure throws IllegalArgumentException.
 */
public final class JsonPatch {
    private static final int MAX_DEPTH = 1000;

    private JsonPatch() {}

    // ---- parsing ----

    /** Strict RFC 8259 parse. Duplicate object keys keep the last value; non-finite numbers are rejected. */
    public static Object parse(String text) {
        Parser p = new Parser(text);
        p.ws();
        Object v = p.value(0);
        p.ws();
        if (p.i != text.length()) throw p.fail("trailing characters");
        return v;
    }

    private static final class Parser {
        final String s;
        int i;

        Parser(String s) { this.s = s; }

        IllegalArgumentException fail(String why) { return new IllegalArgumentException("invalid JSON at " + i + ": " + why); }

        void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++; else break;
            }
        }

        boolean lit(String w) {
            if (s.startsWith(w, i)) { i += w.length(); return true; }
            return false;
        }

        Object value(int depth) {
            if (depth > MAX_DEPTH) throw fail("nesting too deep");
            if (i >= s.length()) throw fail("unexpected end");
            char c = s.charAt(i);
            if (c == '{') {
                i++;
                Map<String, Object> out = new LinkedHashMap<>();
                ws();
                if (i < s.length() && s.charAt(i) == '}') { i++; return out; }
                while (true) {
                    ws();
                    if (i >= s.length() || s.charAt(i) != '"') throw fail("expected a string key");
                    String k = string();
                    ws();
                    if (i >= s.length() || s.charAt(i) != ':') throw fail("expected ':'");
                    i++;
                    ws();
                    out.put(k, value(depth + 1));
                    ws();
                    if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                    if (i < s.length() && s.charAt(i) == '}') { i++; return out; }
                    throw fail("expected ',' or '}'");
                }
            }
            if (c == '[') {
                i++;
                List<Object> out = new ArrayList<>();
                ws();
                if (i < s.length() && s.charAt(i) == ']') { i++; return out; }
                while (true) {
                    ws();
                    out.add(value(depth + 1));
                    ws();
                    if (i < s.length() && s.charAt(i) == ',') { i++; continue; }
                    if (i < s.length() && s.charAt(i) == ']') { i++; return out; }
                    throw fail("expected ',' or ']'");
                }
            }
            if (c == '"') return string();
            if (lit("true")) return Boolean.TRUE;
            if (lit("false")) return Boolean.FALSE;
            if (lit("null")) return null;
            if (c == '-' || (c >= '0' && c <= '9')) return number();
            throw fail("unexpected character");
        }

        private boolean digit() { return i < s.length() && s.charAt(i) >= '0' && s.charAt(i) <= '9'; }

        Object number() {
            int start = i;
            if (s.charAt(i) == '-') i++;
            if (!digit()) throw fail("expected a digit");
            if (s.charAt(i) == '0') i++;
            else while (digit()) i++;
            boolean integer = true;
            if (i < s.length() && s.charAt(i) == '.') {
                i++;
                integer = false;
                if (!digit()) throw fail("expected a digit after '.'");
                while (digit()) i++;
            }
            if (i < s.length() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                i++;
                integer = false;
                if (i < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                if (!digit()) throw fail("expected a digit in the exponent");
                while (digit()) i++;
            }
            String t = s.substring(start, i);
            if (integer) {
                try { return Long.parseLong(t); } catch (NumberFormatException e) { /* too large: use a double */ }
            }
            double d = Double.parseDouble(t);
            if (Double.isInfinite(d)) throw fail("number out of range");
            return d;
        }

        private int hex4() {
            if (i + 4 > s.length()) throw fail("short \\u escape");
            int v = 0;
            for (int k = 0; k < 4; k++) {
                int h = Character.digit(s.charAt(i + k), 16);
                if (h < 0) throw fail("bad \\u escape");
                v = v * 16 + h;
            }
            i += 4;
            return v;
        }

        String string() {
            i++;
            StringBuilder out = new StringBuilder();
            while (true) {
                if (i >= s.length()) throw fail("unterminated string");
                char c = s.charAt(i++);
                if (c == '"') return out.toString();
                if (c < 0x20) throw fail("unescaped control character");
                if (Character.isHighSurrogate(c)) {
                    if (i >= s.length() || !Character.isLowSurrogate(s.charAt(i))) throw fail("lone surrogate");
                    out.append(c).append(s.charAt(i++));
                    continue;
                }
                if (Character.isLowSurrogate(c)) throw fail("lone surrogate");
                if (c != '\\') { out.append(c); continue; }
                if (i >= s.length()) throw fail("unterminated escape");
                char e = s.charAt(i++);
                switch (e) {
                    case '"' -> out.append('"');
                    case '\\' -> out.append('\\');
                    case '/' -> out.append('/');
                    case 'b' -> out.append('\b');
                    case 'f' -> out.append('\f');
                    case 'n' -> out.append('\n');
                    case 'r' -> out.append('\r');
                    case 't' -> out.append('\t');
                    case 'u' -> {
                        int u = hex4();
                        if (Character.isHighSurrogate((char) u)) {
                            if (!s.startsWith("\\u", i)) throw fail("lone surrogate escape");
                            i += 2;
                            int lo = hex4();
                            if (!Character.isLowSurrogate((char) lo)) throw fail("lone surrogate escape");
                            out.append((char) u).append((char) lo);
                        } else if (Character.isLowSurrogate((char) u)) {
                            throw fail("lone surrogate escape");
                        } else {
                            out.append((char) u);
                        }
                    }
                    default -> throw fail("invalid escape");
                }
            }
        }
    }

    // ---- canonical form and equality ----

    private static int compareCodePoints(String a, String b) {
        int i = 0;
        int j = 0;
        while (i < a.length() && j < b.length()) {
            int x = a.codePointAt(i);
            int y = b.codePointAt(j);
            if (x != y) return Integer.compare(x, y);
            i += Character.charCount(x);
            j += Character.charCount(y);
        }
        return Integer.compare(a.length() - i, b.length() - j);
    }

    private static List<String> sortedKeys(Collection<String> keys) {
        TreeSet<String> t = new TreeSet<>(JsonPatch::compareCodePoints);
        t.addAll(keys);
        return new ArrayList<>(t);
    }

    private static boolean isIntegral(Object v) {
        return v instanceof Long || v instanceof Integer || v instanceof Short || v instanceof Byte || v instanceof BigInteger;
    }

    private static boolean isNumber(Object v) { return isIntegral(v) || v instanceof Double || v instanceof Float; }

    private static BigDecimal decimal(Object v) {
        if (v instanceof BigInteger b) return new BigDecimal(b);
        if (isIntegral(v)) return BigDecimal.valueOf(((Number) v).longValue());
        return new BigDecimal(((Number) v).doubleValue());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object v) { return (Map<String, Object>) v; }

    @SuppressWarnings("unchecked")
    private static List<Object> asList(Object v) { return (List<Object>) v; }

    /** Compact JSON with object keys in code point order; whole numbers print without a decimal point. */
    public static String canonical(Object v) {
        StringBuilder out = new StringBuilder();
        write(v, out);
        return out.toString();
    }

    private static void write(Object v, StringBuilder out) {
        if (v == null) out.append("null");
        else if (v instanceof Boolean) out.append(v);
        else if (v instanceof String str) writeString(str, out);
        else if (isIntegral(v)) out.append(v);
        else if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (Double.isNaN(d) || Double.isInfinite(d)) throw new IllegalArgumentException("JSON has no NaN or infinity");
            if (d == Math.rint(d)) out.append(new BigDecimal(d).toBigInteger());
            else out.append(Double.toString(d));
        } else if (v instanceof Map<?, ?> m) {
            Map<String, Object> map = asMap(m);
            out.append('{');
            boolean first = true;
            for (String k : sortedKeys(map.keySet())) {
                if (!first) out.append(',');
                first = false;
                writeString(k, out);
                out.append(':');
                write(map.get(k), out);
            }
            out.append('}');
        } else if (v instanceof List<?> l) {
            out.append('[');
            for (int k = 0; k < l.size(); k++) {
                if (k > 0) out.append(',');
                write(l.get(k), out);
            }
            out.append(']');
        } else throw new IllegalArgumentException("not a JSON value: " + v.getClass().getName());
    }

    private static void writeString(String s, StringBuilder out) {
        out.append('"');
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        out.append('"');
    }

    /** Deep JSON equality: numbers compare numerically, booleans are never numbers, key order is ignored. */
    public static boolean equal(Object a, Object b) {
        if (isNumber(a) && isNumber(b)) {
            double x = ((Number) a).doubleValue();
            double y = ((Number) b).doubleValue();
            if (Double.isNaN(x) || Double.isNaN(y) || Double.isInfinite(x) || Double.isInfinite(y)) return x == y;
            return decimal(a).compareTo(decimal(b)) == 0;
        }
        if (a instanceof Map<?, ?> ma && b instanceof Map<?, ?> mb) {
            if (!ma.keySet().equals(mb.keySet())) return false;
            for (Object k : ma.keySet()) if (!equal(ma.get(k), mb.get(k))) return false;
            return true;
        }
        if (a instanceof List<?> la && b instanceof List<?> lb) {
            if (la.size() != lb.size()) return false;
            for (int k = 0; k < la.size(); k++) if (!equal(la.get(k), lb.get(k))) return false;
            return true;
        }
        if (a == null || b == null) return a == b;
        if (a instanceof Map || a instanceof List || b instanceof Map || b instanceof List) return false;
        return a.equals(b);
    }

    private static Object deepCopy(Object v) {
        if (v instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) {
                if (!(e.getKey() instanceof String k)) throw new IllegalArgumentException("object keys must be strings");
                out.put(k, deepCopy(e.getValue()));
            }
            return out;
        }
        if (v instanceof List<?> l) {
            List<Object> out = new ArrayList<>(l.size());
            for (Object x : l) out.add(deepCopy(x));
            return out;
        }
        return v;
    }

    // ---- JSON Pointer ----

    private static List<String> parsePointer(Object p) {
        if (!(p instanceof String s)) throw new IllegalArgumentException("pointer must be a string");
        List<String> out = new ArrayList<>();
        if (s.isEmpty()) return out;
        if (s.charAt(0) != '/') throw new IllegalArgumentException("pointer must be empty or start with \"/\"");
        for (String t : s.substring(1).split("/", -1)) {
            for (int k = 0; k < t.length(); k++) {
                if (t.charAt(k) == '~' && (k + 1 >= t.length() || (t.charAt(k + 1) != '0' && t.charAt(k + 1) != '1'))) {
                    throw new IllegalArgumentException("bad escape in pointer");
                }
            }
            out.add(t.replace("~1", "/").replace("~0", "~"));
        }
        return out;
    }

    private static String escapeToken(String t) { return t.replace("~", "~0").replace("/", "~1"); }

    private static int index(String token, int n, boolean allowEnd) {
        if (allowEnd && token.equals("-")) return n;
        if (!token.matches("0|[1-9][0-9]*")) throw new IllegalArgumentException("bad array index " + token);
        if (token.length() > 9 || Integer.parseInt(token) > n || (Integer.parseInt(token) == n && !allowEnd)) {
            throw new IllegalArgumentException("array index out of range");
        }
        return Integer.parseInt(token);
    }

    private static Object walk(Object doc, List<String> tokens, int count) {
        Object cur = doc;
        for (int k = 0; k < count; k++) {
            String t = tokens.get(k);
            if (cur instanceof Map<?, ?> m) {
                if (!m.containsKey(t)) throw new IllegalArgumentException("no member " + t);
                cur = m.get(t);
            } else if (cur instanceof List<?> l) {
                cur = l.get(index(t, l.size(), false));
            } else throw new IllegalArgumentException("cannot index a scalar");
        }
        return cur;
    }

    /** RFC 6901 value at pointer ("" is the whole document); the result is not a copy. */
    public static Object getPointer(Object doc, String pointer) {
        List<String> tokens = parsePointer(pointer);
        return walk(doc, tokens, tokens.size());
    }

    // ---- JSON Patch ----

    private static Object add(Object doc, List<String> tokens, Object value) {
        if (tokens.isEmpty()) return value;
        Object parent = walk(doc, tokens, tokens.size() - 1);
        String last = tokens.get(tokens.size() - 1);
        if (parent instanceof Map<?, ?> m) asMap(m).put(last, value);
        else if (parent instanceof List<?> l) asList(l).add(index(last, l.size(), true), value);
        else throw new IllegalArgumentException("cannot add to a scalar");
        return doc;
    }

    private static Object remove(Object doc, List<String> tokens) {
        if (tokens.isEmpty()) throw new IllegalArgumentException("cannot remove the root");
        Object parent = walk(doc, tokens, tokens.size() - 1);
        String last = tokens.get(tokens.size() - 1);
        if (parent instanceof Map<?, ?> m) {
            if (!m.containsKey(last)) throw new IllegalArgumentException("no member " + last);
            return asMap(m).remove(last);
        }
        if (parent instanceof List<?> l) return asList(l).remove(index(last, l.size(), false));
        throw new IllegalArgumentException("cannot remove from a scalar");
    }

    /** Applies an RFC 6902 patch atomically; returns a new document and never changes doc or patch. */
    public static Object applyPatch(Object doc, Object patch) {
        if (!(patch instanceof List<?> ops)) throw new IllegalArgumentException("patch must be an array");
        Object out = deepCopy(doc);
        for (Object o : ops) {
            if (!(o instanceof Map<?, ?> op) || !(op.get("op") instanceof String kind)) throw new IllegalArgumentException("operation needs \"op\"");
            if (!op.containsKey("path")) throw new IllegalArgumentException("operation needs \"path\"");
            List<String> path = parsePointer(op.get("path"));
            if ((kind.equals("add") || kind.equals("replace") || kind.equals("test")) && !op.containsKey("value")) {
                throw new IllegalArgumentException(kind + " needs \"value\"");
            }
            if ((kind.equals("move") || kind.equals("copy")) && !op.containsKey("from")) throw new IllegalArgumentException(kind + " needs \"from\"");
            switch (kind) {
                case "add" -> out = add(out, path, deepCopy(op.get("value")));
                case "remove" -> remove(out, path);
                case "replace" -> {
                    walk(out, path, path.size());
                    if (path.isEmpty()) out = deepCopy(op.get("value"));
                    else { remove(out, path); out = add(out, path, deepCopy(op.get("value"))); }
                }
                case "move" -> {
                    List<String> from = parsePointer(op.get("from"));
                    if (from.equals(path)) { walk(out, from, from.size()); continue; }
                    if (path.size() >= from.size() && path.subList(0, from.size()).equals(from)) {
                        throw new IllegalArgumentException("cannot move a value into itself");
                    }
                    Object value = from.isEmpty() ? out : remove(out, from);
                    out = add(out, path, value);
                }
                case "copy" -> {
                    List<String> from = parsePointer(op.get("from"));
                    out = add(out, path, deepCopy(walk(out, from, from.size())));
                }
                case "test" -> {
                    if (!equal(walk(out, path, path.size()), op.get("value"))) throw new IllegalArgumentException("test failed at " + op.get("path"));
                }
                default -> throw new IllegalArgumentException("unknown op " + kind);
            }
        }
        return out;
    }

    /** RFC 7396 merge patch; returns a new value and never changes target or patch. */
    public static Object mergePatch(Object target, Object patch) {
        if (!(patch instanceof Map<?, ?> p)) return deepCopy(patch);
        Map<String, Object> out = target instanceof Map ? asMap(deepCopy(target)) : new LinkedHashMap<>();
        for (Map.Entry<?, ?> e : p.entrySet()) {
            if (!(e.getKey() instanceof String k)) throw new IllegalArgumentException("object keys must be strings");
            if (e.getValue() == null) out.remove(k);
            else out.put(k, mergePatch(out.get(k), e.getValue()));
        }
        return out;
    }

    /** Deterministic RFC 6902 patch turning a into b: applyPatch(a, createPatch(a, b)) equals b. */
    public static List<Object> createPatch(Object a, Object b) {
        List<Object> ops = new ArrayList<>();
        create(a, b, "", ops);
        return ops;
    }

    private static Map<String, Object> op(String kind, String path, Object value, boolean hasValue) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("op", kind);
        m.put("path", path);
        if (hasValue) m.put("value", deepCopy(value));
        return m;
    }

    private static void create(Object a, Object b, String path, List<Object> ops) {
        if (equal(a, b)) return;
        if (a instanceof Map<?, ?> ma && b instanceof Map<?, ?> mb) {
            TreeSet<String> keys = new TreeSet<>(JsonPatch::compareCodePoints);
            keys.addAll(asMap(ma).keySet());
            keys.addAll(asMap(mb).keySet());
            for (String k : keys) {
                String p = path + "/" + escapeToken(k);
                if (!mb.containsKey(k)) ops.add(op("remove", p, null, false));
                else if (!ma.containsKey(k)) ops.add(op("add", p, mb.get(k), true));
                else create(ma.get(k), mb.get(k), p, ops);
            }
            return;
        }
        if (a instanceof List<?> la && b instanceof List<?> lb) {
            for (int k = 0; k < Math.min(la.size(), lb.size()); k++) create(la.get(k), lb.get(k), path + "/" + k, ops);
            for (int k = la.size() - 1; k >= lb.size(); k--) ops.add(op("remove", path + "/" + k, null, false));
            for (int k = la.size(); k < lb.size(); k++) ops.add(op("add", path + "/" + k, lb.get(k), true));
            return;
        }
        ops.add(op("replace", path, b, true));
    }
}
