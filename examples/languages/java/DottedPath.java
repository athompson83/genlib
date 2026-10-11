// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Dotted paths into JSON-like data ("user.addresses[0].city", 'a["x.y"]'). Values as in JsonPatch: Map with String
 * keys, List, String, numbers, Boolean and null. A parsed path is a list of String keys and Integer indexes (an index
 * beyond Integer.MAX_VALUE is clamped, which behaves as out of range). setPath and deletePath return new structures
 * (LinkedHashMap/ArrayList copies) and never mutate their input. Failures throw IllegalArgumentException.
 */
public final class DottedPath {
    private static final Object MISSING = new Object();

    private DottedPath() {}

    /** Parses a path into String keys and Integer indexes; "" is the root (an empty list). */
    public static List<Object> parsePath(String p) {
        List<Object> out = new ArrayList<>();
        int i = 0;
        int n = p.length();
        while (i < n) {
            char c = p.charAt(i);
            if (c == '[') {
                if (i + 1 < n && p.charAt(i + 1) == '"') {
                    int j = i + 2;
                    StringBuilder buf = new StringBuilder();
                    while (true) {
                        if (j >= n) throw new IllegalArgumentException("unterminated quoted key");
                        if (p.charAt(j) == '\\' && j + 1 < n) { buf.append(p.charAt(j + 1)); j += 2; continue; }
                        if (p.charAt(j) == '"') break;
                        buf.append(p.charAt(j));
                        j++;
                    }
                    if (j + 1 >= n || p.charAt(j + 1) != ']') throw new IllegalArgumentException("expected ]");
                    out.add(buf.toString());
                    i = j + 2;
                } else {
                    int j = i + 1;
                    while (j < n && p.charAt(j) >= '0' && p.charAt(j) <= '9') j++;
                    String digits = p.substring(i + 1, j);
                    if (digits.isEmpty() || (digits.length() > 1 && digits.charAt(0) == '0') || j >= n || p.charAt(j) != ']') {
                        throw new IllegalArgumentException("bad index");
                    }
                    out.add(digits.length() > 10 ? Integer.MAX_VALUE : (int) Math.min(Long.parseLong(digits), Integer.MAX_VALUE));
                    i = j + 1;
                }
                if (i < n && p.charAt(i) == '.') {
                    i++;
                    if (i >= n) throw new IllegalArgumentException("trailing dot");
                }
                continue;
            }
            if (c == '.') throw new IllegalArgumentException("empty segment");
            int j = i;
            while (j < n && p.charAt(j) != '.' && p.charAt(j) != '[') j++;
            out.add(p.substring(i, j));
            i = j;
            if (i < n && p.charAt(i) == '.') {
                i++;
                if (i >= n) throw new IllegalArgumentException("trailing dot");
            }
        }
        return out;
    }

    private static Object step(Object cur, Object k) {
        if (k instanceof Integer) {
            int idx = (Integer) k;
            return cur instanceof List && idx < ((List<?>) cur).size() ? ((List<?>) cur).get(idx) : MISSING;
        }
        return cur instanceof Map && ((Map<?, ?>) cur).containsKey(k) ? ((Map<?, ?>) cur).get(k) : MISSING;
    }

    /** The value at path, or def when a key/index is missing or the walk hits the wrong type. */
    public static Object getPath(Object data, String path, Object def) {
        Object cur = data;
        for (Object k : parsePath(path)) {
            cur = step(cur, k);
            if (cur == MISSING) return def;
        }
        return cur;
    }

    /** The value at path, or null when it is missing. */
    public static Object getPath(Object data, String path) { return getPath(data, path, null); }

    /** True when every step of path exists (a stored null counts as present). */
    public static boolean hasPath(Object data, String path) { return getPath(data, path, MISSING) != MISSING; }

    private static Object copy(Object v) {
        if (v instanceof Map) {
            Map<String, Object> m = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) m.put((String) e.getKey(), copy(e.getValue()));
            return m;
        }
        if (v instanceof List) {
            List<Object> l = new ArrayList<>();
            for (Object x : (List<?>) v) l.add(copy(x));
            return l;
        }
        return v;
    }

    @SuppressWarnings("unchecked")
    private static Object set(Object cur, List<Object> keys, int at, Object value) {
        if (at == keys.size()) return copy(value);
        Object k = keys.get(at);
        if (cur == null) cur = k instanceof Integer ? new ArrayList<>() : new LinkedHashMap<>();
        if (k instanceof Integer) {
            if (!(cur instanceof List)) throw new IllegalArgumentException("index on a non-list");
            int idx = (Integer) k;
            List<Object> list = (List<Object>) copy(cur);
            if (idx > list.size()) throw new IllegalArgumentException("index out of range");
            Object child = idx < list.size() ? list.get(idx) : null;
            Object v = set(child, keys, at + 1, value);
            if (idx == list.size()) list.add(v); else list.set(idx, v);
            return list;
        }
        if (!(cur instanceof Map)) throw new IllegalArgumentException("key on a non-object");
        Map<String, Object> map = (Map<String, Object>) copy(cur);
        map.put((String) k, set(map.get(k), keys, at + 1, value));
        return map;
    }

    /** A new structure with value at path, creating maps/lists; index == size appends; "" returns value. */
    public static Object setPath(Object data, String path, Object value) { return set(data, parsePath(path), 0, value); }

    @SuppressWarnings("unchecked")
    private static Object delete(Object cur, List<Object> keys, int at) {
        Object k = keys.get(at);
        if (step(cur, k) == MISSING) return copy(cur);
        Object fresh = copy(cur);
        if (k instanceof Integer) {
            List<Object> list = (List<Object>) fresh;
            int idx = (Integer) k;
            if (at + 1 < keys.size()) list.set(idx, delete(((List<?>) cur).get(idx), keys, at + 1));
            else list.remove(idx);
        } else {
            Map<String, Object> map = (Map<String, Object>) fresh;
            if (at + 1 < keys.size()) map.put((String) k, delete(((Map<?, ?>) cur).get(k), keys, at + 1));
            else map.remove(k);
        }
        return fresh;
    }

    /** A new structure without the key/index at path (lists shift); missing paths give an unchanged copy, "" gives null. */
    public static Object deletePath(Object data, String path) {
        List<Object> keys = parsePath(path);
        if (keys.isEmpty()) return null;
        return delete(data, keys, 0);
    }
}
